import type { BlingClient } from "../bling/blingClient";
import { consultarVendas } from "../tools/consultarVendas";
import { consultarFaturamento } from "../tools/consultarFaturamento";
import { consultarEstoque } from "../tools/consultarEstoque";
import { consultarProducao } from "../tools/consultarProducao";
import { gerarRelatorioDiario } from "../tools/relatorioDiario";
import { consultarClientes } from "../tools/consultarClientes";
import { consultarCatalogo } from "../tools/consultarCatalogo";
import { consultarFinanceiro } from "../tools/consultarFinanceiro";
import { consultarPedidos } from "../tools/consultarPedidos";

export interface ToolDeps { client: BlingClient; situacoesFaturado: number[]; hoje?: Date; }

const PERIODO_ENUM = ["hoje", "ontem", "esta_semana", "semana_passada", "este_mes", "mes_passado", "personalizado"];
const periodoProp = {
  periodo: { type: "string", enum: PERIODO_ENUM, description: "Janela de tempo. Use 'personalizado' com dataInicial/dataFinal (YYYY-MM-DD)." },
  dataInicial: { type: "string", description: "YYYY-MM-DD (só para personalizado)" },
  dataFinal: { type: "string", description: "YYYY-MM-DD (só para personalizado)" },
};

export const toolDefinitions = [
  { type: "function", function: { name: "consultar_vendas", description: "Total vendido, nº de pedidos e ticket médio num período.",
    parameters: { type: "object", properties: periodoProp, required: ["periodo"] } } },
  { type: "function", function: { name: "consultar_faturamento", description: "Faturamento (aprox. por pedidos faturados) num período, com comparação opcional.",
    parameters: { type: "object", properties: { ...periodoProp, comparar_anterior: { type: "boolean" } }, required: ["periodo"] } } },
  { type: "function", function: { name: "consultar_estoque", description: "Saldos de estoque; itens abaixo do mínimo ou busca por nome.",
    parameters: { type: "object", properties: { filtro: { type: "string", enum: ["abaixo_minimo", "todos", "busca"] }, termo: { type: "string" } }, required: ["filtro"] } } },
  { type: "function", function: { name: "consultar_producao", description: "Ordens de produção e quantidade produzida num período.",
    parameters: { type: "object", properties: { ...periodoProp, situacao: { type: "string", enum: ["abertas", "concluidas", "todas"] } }, required: ["periodo"] } } },
  { type: "function", function: { name: "gerar_relatorio_diario", description: "Resumo do dia: vendas, faturamento, estoque crítico e produção.",
    parameters: { type: "object", properties: { data: { type: "string", enum: ["hoje", "ontem"] } } } } },
  { type: "function", function: { name: "consultar_clientes", description: "Clientes: contagem total, busca por nome, ou maiores clientes por valor comprado num período.",
    parameters: { type: "object", properties: { modo: { type: "string", enum: ["contagem", "busca", "maiores"] }, termo: { type: "string" }, ...periodoProp }, required: ["modo"] } } },
  { type: "function", function: { name: "consultar_catalogo", description: "Catálogo de produtos: contagem, busca por nome, mais caros ou mais baratos (com preço e custo).",
    parameters: { type: "object", properties: { modo: { type: "string", enum: ["contagem", "busca", "mais_caros", "mais_baratos"] }, termo: { type: "string" } }, required: ["modo"] } } },
  { type: "function", function: { name: "consultar_financeiro", description: "Financeiro: contas a receber ou a pagar; total e itens, opcionalmente filtrando por vencimento num período.",
    parameters: { type: "object", properties: { tipo: { type: "string", enum: ["a_receber", "a_pagar"] }, ...periodoProp }, required: ["tipo"] } } },
  { type: "function", function: { name: "consultar_pedidos", description: "Pedidos de venda: maiores do período, detalhe de um pedido por número (com itens), ou pedidos de um cliente.",
    parameters: { type: "object", properties: { modo: { type: "string", enum: ["maiores", "detalhe", "por_cliente"] }, numero: { type: "string" }, cliente: { type: "string" }, ...periodoProp }, required: ["modo"] } } },
] as const;

export async function executarTool(nome: string, input: any, deps: ToolDeps): Promise<unknown> {
  const base = { client: deps.client, hoje: deps.hoje };
  switch (nome) {
    case "consultar_vendas": return consultarVendas(base, input);
    case "consultar_faturamento": return consultarFaturamento({ ...base, situacoesFaturado: deps.situacoesFaturado }, input);
    case "consultar_estoque": return consultarEstoque({ client: deps.client }, input);
    case "consultar_producao": return consultarProducao(base, input);
    case "gerar_relatorio_diario": return gerarRelatorioDiario({ ...base, situacoesFaturado: deps.situacoesFaturado }, input);
    case "consultar_clientes": return consultarClientes({ client: deps.client, hoje: deps.hoje }, input);
    case "consultar_catalogo": return consultarCatalogo({ client: deps.client }, input);
    case "consultar_financeiro": return consultarFinanceiro({ client: deps.client, hoje: deps.hoje }, input);
    case "consultar_pedidos": return consultarPedidos({ client: deps.client, hoje: deps.hoje }, input);
    default: throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}
