import type { BlingClient } from "./blingClient";

export interface FiltroData { dataInicial: string; dataFinal: string; situacoes?: number[]; }
export interface Paginado<T = any> { itens: T[]; truncado: boolean; }

export async function listarPedidosVenda(c: BlingClient, f: FiltroData): Promise<Paginado> {
  const query: Record<string, unknown> = { dataInicial: f.dataInicial, dataFinal: f.dataFinal };
  if (f.situacoes?.length) query["idsSituacoes[]"] = f.situacoes;
  return c.getAllPages("/pedidos/vendas", query);
}
export async function obterPedidoVenda(c: BlingClient, id: number): Promise<any> {
  return c.get(`/pedidos/vendas/${id}`);
}
export async function listarProdutos(c: BlingClient): Promise<Paginado> {
  return c.getAllPages("/produtos");
}
export async function listarOrdensProducao(c: BlingClient, f: FiltroData): Promise<Paginado> {
  return c.getAllPages("/ordens-producao", { dataInicial: f.dataInicial, dataFinal: f.dataFinal });
}
export async function listarContatos(c: BlingClient): Promise<Paginado> {
  return c.getAllPages("/contatos");
}
export async function listarContasReceber(c: BlingClient): Promise<Paginado> {
  return c.getAllPages("/contas/receber");
}
export async function listarContasPagar(c: BlingClient): Promise<Paginado> {
  return c.getAllPages("/contas/pagar");
}

// --- Notas fiscais eletrônicas (NF-e) ---
export interface FiltroNfe { dataInicial: string; dataFinal: string; tipo?: number; situacoes?: number[]; }
export async function listarNotasFiscais(c: BlingClient, f: FiltroNfe): Promise<Paginado> {
  const query: Record<string, unknown> = { dataEmissaoInicial: f.dataInicial, dataEmissaoFinal: f.dataFinal };
  if (f.tipo !== undefined) query["tipo"] = f.tipo;
  if (f.situacoes?.length) query["situacoes[]"] = f.situacoes;
  return c.getAllPages("/nfe", query);
}
export async function obterNotaFiscal(c: BlingClient, id: number): Promise<any> {
  return c.get(`/nfe/${id}`);
}
