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
export async function listarPedidosCompra(c: BlingClient, f: FiltroData): Promise<Paginado> {
  return c.getAllPages("/pedidos/compras", { dataInicial: f.dataInicial, dataFinal: f.dataFinal });
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
export interface FiltroConta { dataInicial?: string; dataFinal?: string; situacoes?: number[]; }
function queryContas(f: FiltroConta): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  if (f.dataInicial) q["dataVencimentoInicial"] = f.dataInicial;
  if (f.dataFinal) q["dataVencimentoFinal"] = f.dataFinal;
  if (f.situacoes?.length) q["situacoes[]"] = f.situacoes;
  return q;
}
export async function listarContasReceber(c: BlingClient, f: FiltroConta = {}): Promise<Paginado> {
  return c.getAllPages("/contas/receber", queryContas(f));
}
export async function listarContasPagar(c: BlingClient, f: FiltroConta = {}): Promise<Paginado> {
  return c.getAllPages("/contas/pagar", queryContas(f));
}

// --- Notas fiscais: NF-e (/nfe, modelo 55) e NFC-e (/nfce, modelo 65, varejo) ---
export interface FiltroNfe { dataInicial: string; dataFinal: string; tipo?: number; situacoes?: number[]; }
function queryNfe(f: FiltroNfe): Record<string, unknown> {
  const q: Record<string, unknown> = { dataEmissaoInicial: f.dataInicial, dataEmissaoFinal: f.dataFinal };
  if (f.tipo !== undefined) q["tipo"] = f.tipo;
  if (f.situacoes?.length) q["situacoes[]"] = f.situacoes;
  return q;
}
export async function listarNotasFiscais(c: BlingClient, f: FiltroNfe): Promise<Paginado> {
  return c.getAllPages("/nfe", queryNfe(f));
}
export async function obterNotaFiscal(c: BlingClient, id: number): Promise<any> {
  return c.get(`/nfe/${id}`);
}
export async function listarNotasConsumidor(c: BlingClient, f: FiltroNfe): Promise<Paginado> {
  return c.getAllPages("/nfce", queryNfe(f));
}
export async function obterNotaConsumidor(c: BlingClient, id: number): Promise<any> {
  return c.get(`/nfce/${id}`);
}
