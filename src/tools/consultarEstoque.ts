import type { BlingClient } from "../bling/blingClient";
import { listarProdutos } from "../bling/endpoints";

export interface EstoqueDeps { client: BlingClient; }
export interface EstoqueArgs { filtro: "abaixo_minimo" | "todos" | "busca"; termo?: string; }

function normaliza(s: string) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

export async function consultarEstoque(deps: EstoqueDeps, args: EstoqueArgs) {
  const { itens: produtos } = await listarProdutos(deps.client);
  let itens = produtos.map((p) => ({
    id: p.id, nome: p.nome, codigo: p.codigo,
    saldo: Number(p.estoque?.saldoVirtualTotal) || 0,
    minimo: Number(p.estoque?.minimo) || 0,
  }));

  if (args.filtro === "abaixo_minimo") itens = itens.filter((i) => i.minimo > 0 && i.saldo < i.minimo);
  else if (args.filtro === "busca") {
    const t = normaliza(args.termo || "");
    itens = itens.filter((i) => normaliza(i.nome || "").includes(t) || normaliza(i.codigo || "").includes(t));
  }
  return { filtro: args.filtro, total: itens.length, itens: itens.slice(0, 100) };
}
