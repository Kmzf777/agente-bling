import type { BlingClient } from "../bling/blingClient";
import { listarProdutos } from "../bling/endpoints";

export interface CatalogoDeps { client: BlingClient; }
export interface CatalogoArgs { modo: "contagem" | "busca" | "mais_caros" | "mais_baratos"; termo?: string; }

function normaliza(s: string) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

export async function consultarCatalogo(deps: CatalogoDeps, args: CatalogoArgs) {
  const produtos = (await listarProdutos(deps.client)).itens.map((p) => ({
    id: p.id, nome: p.nome, codigo: p.codigo,
    preco: Number(p.preco) || 0, precoCusto: Number(p.precoCusto) || 0,
    saldo: Number(p.estoque?.saldoVirtualTotal) || 0,
  }));
  if (args.modo === "contagem") return { modo: "contagem", total: produtos.length };
  if (args.modo === "mais_caros") return { modo: "mais_caros", produtos: [...produtos].sort((a, b) => b.preco - a.preco).slice(0, 10) };
  if (args.modo === "mais_baratos") return { modo: "mais_baratos", produtos: [...produtos].sort((a, b) => a.preco - b.preco).slice(0, 10) };
  const t = normaliza(args.termo || "");
  const produtosFiltrados = produtos.filter((p) => normaliza(p.nome || "").includes(t)).slice(0, 50);
  return { modo: "busca", total: produtosFiltrados.length, produtos: produtosFiltrados };
}
