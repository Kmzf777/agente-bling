import type { BlingClient } from "../bling/blingClient";
import { consultarVendas } from "../tools/consultarVendas";
import { consultarFaturamento } from "../tools/consultarFaturamento";
import { consultarEstoque } from "../tools/consultarEstoque";
import { consultarProducao } from "../tools/consultarProducao";
import { gerarRelatorioDiario } from "../tools/relatorioDiario";

export interface ToolDeps { client: BlingClient; situacoesFaturado: number[]; hoje?: Date; }

const PERIODO_ENUM = ["hoje", "ontem", "esta_semana", "semana_passada", "este_mes", "mes_passado", "personalizado"];
const periodoProp = {
  periodo: { type: "string", enum: PERIODO_ENUM, description: "Janela de tempo. Use 'personalizado' com dataInicial/dataFinal (YYYY-MM-DD)." },
  dataInicial: { type: "string", description: "YYYY-MM-DD (só para personalizado)" },
  dataFinal: { type: "string", description: "YYYY-MM-DD (só para personalizado)" },
};

export const toolDefinitions = [
  { name: "consultar_vendas", description: "Total vendido, nº de pedidos e ticket médio num período.",
    input_schema: { type: "object", properties: periodoProp, required: ["periodo"] } },
  { name: "consultar_faturamento", description: "Faturamento (aprox. por pedidos faturados) num período, com comparação opcional.",
    input_schema: { type: "object", properties: { ...periodoProp, comparar_anterior: { type: "boolean" } }, required: ["periodo"] } },
  { name: "consultar_estoque", description: "Saldos de estoque; itens abaixo do mínimo ou busca por nome.",
    input_schema: { type: "object", properties: { filtro: { type: "string", enum: ["abaixo_minimo", "todos", "busca"] }, termo: { type: "string" } }, required: ["filtro"] } },
  { name: "consultar_producao", description: "Ordens de produção e quantidade produzida num período.",
    input_schema: { type: "object", properties: { ...periodoProp, situacao: { type: "string", enum: ["abertas", "concluidas", "todas"] } }, required: ["periodo"] } },
  { name: "gerar_relatorio_diario", description: "Resumo do dia: vendas, faturamento, estoque crítico e produção.",
    input_schema: { type: "object", properties: { data: { type: "string", enum: ["hoje", "ontem"] } } } },
] as const;

export async function executarTool(nome: string, input: any, deps: ToolDeps): Promise<unknown> {
  const base = { client: deps.client, hoje: deps.hoje };
  switch (nome) {
    case "consultar_vendas": return consultarVendas(base, input);
    case "consultar_faturamento": return consultarFaturamento({ ...base, situacoesFaturado: deps.situacoesFaturado }, input);
    case "consultar_estoque": return consultarEstoque({ client: deps.client }, input);
    case "consultar_producao": return consultarProducao(base, input);
    case "gerar_relatorio_diario": return gerarRelatorioDiario({ ...base, situacoesFaturado: deps.situacoesFaturado }, input);
    default: throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}
