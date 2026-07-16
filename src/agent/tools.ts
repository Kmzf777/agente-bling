import { tool } from "ai";
import { z } from "zod";
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
import { CONHECIMENTO_CAFE } from "./conhecimento";

export interface ToolDeps { client: BlingClient; situacoesFaturado: number[]; hoje?: Date; }

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

/**
 * Constrói o mapa de ferramentas (formato Vercel AI SDK) que o agent loop passa ao modelo.
 * Tier 1: ferramentas típadas e ricas. Tier 2: escape hatch bling_consultar_api (read-only).
 */
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
      description: "Produção do período. No Canastra, produção = pedidos de compra do contato 'Fabrica' (cada pedido de compra da Fabrica é uma ordem de produção). Retorna nº de ordens e valor total.",
      inputSchema: z.object({ ...periodoReq }),
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
    contexto_cafe: tool({
      description: "Base de conhecimento de gestão de café especial (benchmarks de mercado, playbook de red flags causa→ação, fórmulas de CMV/margem/ponto de equilíbrio, gestão de café verde vs torrado). Chame SÓ quando precisar de análise ou recomendação aprofundada — NUNCA para respostas simples de dados.",
      inputSchema: z.object({}),
      execute: async () => ({ conhecimento: CONHECIMENTO_CAFE }),
    }),
  };
}
