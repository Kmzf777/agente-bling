import type { BlingClient } from "../bling/blingClient";
import { listarContasReceber, listarContasPagar } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface FinanceiroDeps { client: BlingClient; hoje?: Date; }
export interface FinanceiroArgs { tipo: "a_receber" | "a_pagar"; periodo?: Periodo; dataInicial?: string; dataFinal?: string; }

// Situação 2 = pago/recebido no Bling v3; demais (1 em aberto, 3 parcial, ...) tratadas como "em aberto".
// (Confirmar os códigos contra developer.bling.com.br/referencia; centralizado aqui para ajuste fácil.)
const SITUACAO_PAGO = new Set([2]);

export async function consultarFinanceiro(deps: FinanceiroDeps, args: FinanceiroArgs, hoje: Date = deps.hoje ?? new Date()) {
  const periodo = args.periodo ? resolverPeriodo(args.periodo, hoje, args.dataInicial, args.dataFinal) : undefined;
  const filtro = periodo ? { dataInicial: periodo.dataInicial, dataFinal: periodo.dataFinal } : {};
  const { itens: contas, truncado } = args.tipo === "a_receber"
    ? await listarContasReceber(deps.client, filtro)
    : await listarContasPagar(deps.client, filtro);

  const val = (c: any) => Number(c.valor) || 0;
  const pago = contas.filter((c: any) => SITUACAO_PAGO.has(Number(c.situacao)));
  const emAberto = contas.filter((c: any) => !SITUACAO_PAGO.has(Number(c.situacao)));
  const soma = (arr: any[]) => Math.round(arr.reduce((s, c) => s + val(c), 0) * 100) / 100;

  return {
    tipo: args.tipo,
    periodo,
    total: soma(contas),
    totalPago: soma(pago),
    totalEmAberto: soma(emAberto),
    quantidade: contas.length,
    quantidadePago: pago.length,
    quantidadeEmAberto: emAberto.length,
    paginacao: { truncado },
    itens: contas.slice(0, 20).map((c: any) => ({
      valor: val(c), vencimento: c.vencimento, situacao: c.situacao, contato: c.contato?.nome ?? c.contato?.id ?? null,
    })),
  };
}
