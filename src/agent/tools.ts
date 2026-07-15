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
import { consultarNotasFiscais } from "../tools/consultarNotasFiscais";
import { consultarApi } from "../tools/consultarApi";
import { tool } from "ai";
import { z } from "zod";

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

// --- Tools no formato Vercel AI SDK (usadas pelo agent loop novo) ---
const periodoEnum = z.enum(["hoje", "ontem", "esta_semana", "semana_passada", "este_mes", "mes_passado", "personalizado"]);
const periodoReq = {
  periodo: periodoEnum.describe("Janela de tempo. 'personalizado' usa dataInicial/dataFinal (YYYY-MM-DD)."),
  dataInicial: z.string().optional().describe("YYYY-MM-DD (só para 'personalizado')"),
  dataFinal: z.string().optional().describe("YYYY-MM-DD (só para 'personalizado')"),
};
const periodoOpt = {
  periodo: periodoEnum.optional().describe("Janela de tempo (opcional)."),
  dataInicial: z.string().optional(),
  dataFinal: z.string().optional(),
};

export function construirTools(deps: ToolDeps) {
  const hoje = deps.hoje ?? new Date();
  const base = { client: deps.client, hoje };
  return {
    consultar_vendas: tool({
      description: "Total vendido, nº de pedidos e ticket médio num período.",
      inputSchema: z.object({ ...periodoReq }),
      execute: async (a) => consultarVendas(base, a as any),
    }),
    consultar_faturamento: tool({
      description: "Faturamento num período (por pedidos faturados), com comparação opcional ao período anterior.",
      inputSchema: z.object({ ...periodoReq, comparar_anterior: z.boolean().optional() }),
      execute: async (a) => consultarFaturamento({ ...base, situacoesFaturado: deps.situacoesFaturado }, a as any),
    }),
    consultar_notas_fiscais: tool({
      description: "Notas fiscais (NF-e) do período: itens, CFOP por item, natureza da operação; separa venda de bonificação. Use para perguntas de CFOP, bonificação ou detalhe fiscal.",
      inputSchema: z.object({ ...periodoReq, tipo: z.number().optional().describe("0=entrada, 1=saída") }),
      execute: async (a) => consultarNotasFiscais({ client: deps.client }, a as any, hoje),
    }),
    consultar_financeiro: tool({
      description: "Contas a pagar ou a receber no período; distingue pago x em aberto (por situação).",
      inputSchema: z.object({ tipo: z.enum(["a_receber", "a_pagar"]), ...periodoOpt }),
      execute: async (a) => consultarFinanceiro({ client: deps.client, hoje }, a as any, hoje),
    }),
    consultar_estoque: tool({
      description: "Saldos de estoque; itens abaixo do mínimo ou busca por nome.",
      inputSchema: z.object({ filtro: z.enum(["abaixo_minimo", "todos", "busca"]), termo: z.string().optional() }),
      execute: async (a) => consultarEstoque({ client: deps.client }, a as any),
    }),
    consultar_producao: tool({
      description: "Ordens de produção e quantidade produzida num período.",
      inputSchema: z.object({ ...periodoReq, situacao: z.enum(["abertas", "concluidas", "todas"]).optional() }),
      execute: async (a) => consultarProducao(base, a as any),
    }),
    consultar_clientes: tool({
      description: "Clientes: contagem total, busca por nome, ou maiores clientes por valor comprado num período.",
      inputSchema: z.object({ modo: z.enum(["contagem", "busca", "maiores"]), termo: z.string().optional(), ...periodoOpt }),
      execute: async (a) => consultarClientes({ client: deps.client, hoje }, a as any),
    }),
    consultar_catalogo: tool({
      description: "Catálogo de produtos: contagem, busca por nome, mais caros ou mais baratos (com preço e custo).",
      inputSchema: z.object({ modo: z.enum(["contagem", "busca", "mais_caros", "mais_baratos"]), termo: z.string().optional() }),
      execute: async (a) => consultarCatalogo({ client: deps.client }, a as any),
    }),
    consultar_pedidos: tool({
      description: "Pedidos de venda: maiores do período, detalhe de um pedido por número (com itens), ou pedidos de um cliente.",
      inputSchema: z.object({ modo: z.enum(["maiores", "detalhe", "por_cliente"]), numero: z.union([z.string(), z.number()]).optional(), cliente: z.string().optional(), ...periodoOpt }),
      execute: async (a) => consultarPedidos({ client: deps.client, hoje }, a as any),
    }),
    gerar_relatorio_diario: tool({
      description: "Resumo do dia: vendas, faturamento, estoque crítico e produção.",
      inputSchema: z.object({ data: z.enum(["hoje", "ontem"]).optional() }),
      execute: async (a) => gerarRelatorioDiario({ client: deps.client, hoje, situacoesFaturado: deps.situacoesFaturado }, a as any),
    }),
    bling_consultar_api: tool({
      description: "Escape hatch: consulta QUALQUER endpoint de LEITURA da API v3 do Bling que as outras tools não cobrem (ex.: '/nfe', '/contas/pagar', '/depositos'). Aceita params e paginação. Somente leitura.",
      inputSchema: z.object({ path: z.string(), params: z.record(z.any()).optional(), todasPaginas: z.boolean().optional(), maxPaginas: z.number().optional() }),
      execute: async (a) => consultarApi({ client: deps.client }, a as any),
    }),
  };
}
