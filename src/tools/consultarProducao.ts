import type { BlingClient } from "../bling/blingClient";
import { listarOrdensProducao } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface ProducaoDeps { client: BlingClient; hoje?: Date; }
export interface ProducaoArgs { periodo: Periodo; situacao?: "abertas" | "concluidas" | "todas"; dataInicial?: string; dataFinal?: string; }

export async function consultarProducao(deps: ProducaoDeps, args: ProducaoArgs) {
  const periodo = resolverPeriodo(args.periodo, deps.hoje ?? new Date(), args.dataInicial, args.dataFinal);
  let { itens: ordens } = await listarOrdensProducao(deps.client, periodo);
  const sit = args.situacao ?? "todas";
  if (sit !== "todas") {
    const alvo = sit === "abertas" ? "aberta" : "concluida";
    ordens = ordens.filter((o) => String(o.situacao ?? "").toLowerCase().includes(alvo));
  }
  return {
    periodo, situacao: sit, numeroOrdens: ordens.length,
    quantidadeTotal: ordens.reduce((s, o) => s + (Number(o.quantidade) || 0), 0),
  };
}
