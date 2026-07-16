import type { BlingClient } from "../bling/blingClient";
import { consultarVendas } from "./consultarVendas";
import { consultarFaturamento } from "./consultarFaturamento";
import { consultarEstoque } from "./consultarEstoque";
import { consultarProducao } from "./consultarProducao";
import { resolverPeriodo } from "../util/periodo";

export interface RelatorioDeps { client: BlingClient; hoje?: Date; situacoesFaturado: number[]; }
export interface RelatorioArgs { data?: "hoje" | "ontem"; }

async function seguro<T>(fn: () => Promise<T>): Promise<T | { erro: string }> {
  try { return await fn(); } catch (e) { return { erro: String(e) }; }
}

export async function gerarRelatorioDiario(deps: RelatorioDeps, args: RelatorioArgs) {
  const p = (args.data ?? "hoje") as "hoje" | "ontem";
  const hoje = deps.hoje ?? new Date();
  const { dataInicial } = resolverPeriodo(p, hoje);
  const [vendas, faturamento, estoqueCritico, producao] = await Promise.all([
    seguro(() => consultarVendas({ client: deps.client, hoje }, { periodo: p })),
    seguro(() => consultarFaturamento({ client: deps.client, hoje, situacoesFaturado: deps.situacoesFaturado }, { periodo: p })),
    seguro(() => consultarEstoque({ client: deps.client }, { filtro: "abaixo_minimo" })),
    seguro(() => consultarProducao({ client: deps.client, hoje }, { periodo: p })),
  ]);
  return { data: dataInicial, vendas, faturamento, estoqueCritico, producao };
}
