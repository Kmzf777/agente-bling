import type { BlingClient } from "../bling/blingClient";
import { listarContasReceber, listarContasPagar } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface FinanceiroDeps { client: BlingClient; hoje?: Date; }
export interface FinanceiroArgs { tipo: "a_receber" | "a_pagar"; periodo?: Periodo; dataInicial?: string; dataFinal?: string; }

export async function consultarFinanceiro(deps: FinanceiroDeps, args: FinanceiroArgs) {
  const { itens: contas } = args.tipo === "a_receber"
    ? await listarContasReceber(deps.client)
    : await listarContasPagar(deps.client);
  let filtradas = contas;
  let periodo: { dataInicial: string; dataFinal: string } | undefined;
  if (args.periodo) {
    periodo = resolverPeriodo(args.periodo, deps.hoje ?? new Date(), args.dataInicial, args.dataFinal);
    filtradas = contas.filter((c) => {
      const v = String(c.vencimento || "").slice(0, 10);
      return v >= periodo!.dataInicial && v <= periodo!.dataFinal;
    });
  }
  const total = filtradas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const itens = [...filtradas]
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
    .slice(0, 10)
    .map((c) => ({ valor: Number(c.valor) || 0, vencimento: c.vencimento, contato: c.contato?.nome ?? c.contato?.id ?? null }));
  return { tipo: args.tipo, periodo, total: Math.round(total * 100) / 100, quantidade: filtradas.length, observacao: "Somado por vencimento no período; não distingue pago/em aberto.", itens };
}
