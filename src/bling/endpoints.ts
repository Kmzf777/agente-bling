import type { BlingClient } from "./blingClient";

export interface FiltroData { dataInicial: string; dataFinal: string; situacoes?: number[]; }

export async function listarPedidosVenda(c: BlingClient, f: FiltroData): Promise<any[]> {
  const query: Record<string, unknown> = { dataInicial: f.dataInicial, dataFinal: f.dataFinal };
  if (f.situacoes?.length) query["idsSituacoes[]"] = f.situacoes;
  return c.getAllPages("/pedidos/vendas", query);
}
export async function obterPedidoVenda(c: BlingClient, id: number): Promise<any> {
  return c.get(`/pedidos/vendas/${id}`);
}
export async function listarSaldosEstoque(c: BlingClient): Promise<any[]> {
  return c.getAllPages("/estoques/saldos");
}
export async function listarProdutos(c: BlingClient): Promise<any[]> {
  return c.getAllPages("/produtos");
}
export async function listarOrdensProducao(c: BlingClient, f: FiltroData): Promise<any[]> {
  return c.getAllPages("/ordens-producao", { dataInicial: f.dataInicial, dataFinal: f.dataFinal });
}
