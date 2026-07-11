import type { BlingClient } from "../bling/blingClient";
import { consultarVendas } from "./consultarVendas";
import { consultarFaturamento } from "./consultarFaturamento";
import { consultarEstoque } from "./consultarEstoque";
import { consultarProducao } from "./consultarProducao";
import { resolverPeriodo } from "../util/periodo";

export interface RelatorioDeps { client: BlingClient; hoje?: Date; situacoesFaturado: number[]; }
export interface RelatorioArgs { data?: "hoje" | "ontem"; }

export async function gerarRelatorioDiario(deps: RelatorioDeps, args: RelatorioArgs) {
  const p = (args.data ?? "hoje") as "hoje" | "ontem";
  const hoje = deps.hoje ?? new Date();
  const { dataInicial } = resolverPeriodo(p, hoje);
  const [vendas, faturamento, estoqueCritico, producao] = await Promise.all([
    consultarVendas({ client: deps.client, hoje }, { periodo: p }),
    consultarFaturamento({ client: deps.client, hoje, situacoesFaturado: deps.situacoesFaturado }, { periodo: p }),
    consultarEstoque({ client: deps.client }, { filtro: "abaixo_minimo" }),
    consultarProducao({ client: deps.client, hoje }, { periodo: p, situacao: "todas" }),
  ]);
  return { data: dataInicial, vendas, faturamento, estoqueCritico, producao };
}
