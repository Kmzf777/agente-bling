import type { BlingClient } from "../bling/blingClient";
import { listarPedidosVenda } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface FatDeps { client: BlingClient; hoje?: Date; situacoesFaturado: number[]; }
export interface FatArgs { periodo: Periodo; dataInicial?: string; dataFinal?: string; comparar_anterior?: boolean; }

async function somaPeriodo(client: BlingClient, sit: number[], p: { dataInicial: string; dataFinal: string }) {
  const { itens: pedidos } = await listarPedidosVenda(client, { ...p, situacoes: sit });
  const total = pedidos.reduce((s, x) => s + (Number(x.total) || 0), 0);
  return { total: Math.round(total * 100) / 100, numeroPedidos: pedidos.length };
}

export async function consultarFaturamento(deps: FatDeps, args: FatArgs) {
  const hoje = deps.hoje ?? new Date();
  const p = resolverPeriodo(args.periodo, hoje, args.dataInicial, args.dataFinal);
  const atual = await somaPeriodo(deps.client, deps.situacoesFaturado, p);
  const out: any = {
    periodo: p, faturamento: atual.total, numeroPedidos: atual.numeroPedidos,
    observacao: "Aproximado por pedidos com situação faturada (não NF-e).",
  };
  if (args.comparar_anterior) {
    const dias = Math.round((Date.parse(p.dataFinal) - Date.parse(p.dataInicial)) / 86400000) + 1;
    const fim = new Date(Date.parse(p.dataInicial) - 86400000);
    const ini = new Date(fim.getTime() - (dias - 1) * 86400000);
    const anterior = await somaPeriodo(deps.client, deps.situacoesFaturado,
      { dataInicial: ini.toISOString().slice(0, 10), dataFinal: fim.toISOString().slice(0, 10) });
    out.periodoAnterior = anterior;
    out.variacaoPercentual = anterior.total ? Math.round(((atual.total - anterior.total) / anterior.total) * 1000) / 10 : null;
  }
  return out;
}
