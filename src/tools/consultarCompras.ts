import type { BlingClient } from "../bling/blingClient";
import { listarPedidosCompra, obterPedidoCompra } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface ComprasDeps { client: BlingClient; hoje?: Date; contatoId?: string; }
export interface ComprasArgs { periodo: Periodo; dataInicial?: string; dataFinal?: string; }

// Mesma convenção do consultarProducao: produção = pedidos de compra do contato "Fabrica".
const CONTATO_PRODUCAO_NOME = "fabrica";
// Copiado EXATAMENTE de src/tools/consultarProducao.ts:
function normaliza(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
const arred = (n: number) => Math.round(n * 100) / 100;
const MAX_DETALHE = 2000;
const TOP_PRODUTOS = 50;

interface GrupoProduto { descricao: string; codigo?: string; quantidade: number; valor: number; itens: number; }

function agregaProdutos(pedidos: any[]) {
  const map = new Map<string, GrupoProduto>();
  let quantidadeTotal = 0, valorTotal = 0;
  for (const ped of pedidos) {
    for (const it of (ped.itens ?? [])) {
      const q = Number(it.quantidade) || 0;
      const v = Number(it.valor) || 0;
      quantidadeTotal += q; valorTotal += v;
      const chave = String(it.descricao ?? it.codigo ?? "sem-descricao");
      const cur = map.get(chave) ?? { descricao: chave, codigo: it.codigo != null ? String(it.codigo) : undefined, quantidade: 0, valor: 0, itens: 0 };
      cur.quantidade += q; cur.valor += v; cur.itens += 1;
      map.set(chave, cur);
    }
  }
  const porProduto = [...map.values()].map((p) => ({ ...p, valor: arred(p.valor) }))
    .sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor).slice(0, TOP_PRODUTOS);
  return { quantidadeTotal: arred(quantidadeTotal), valorTotal: arred(valorTotal), porProduto };
}

export async function consultarCompras(deps: ComprasDeps, args: ComprasArgs) {
  const periodo = resolverPeriodo(args.periodo, deps.hoje ?? new Date(), args.dataInicial, args.dataFinal);
  const { itens: pedidos, truncado: truncadoLista } = await listarPedidosCompra(deps.client, periodo);

  // Abre cada pedido para obter os itens quando a lista não os traz (teto só de segurança).
  let truncado = truncadoLista;
  let detalhes = 0;
  const comItens: any[] = [];
  for (const ped of pedidos) {
    if ((ped.itens?.length ?? 0) > 0 || ped.id == null) { comItens.push(ped); continue; }
    if (detalhes >= MAX_DETALHE) { truncado = true; comItens.push(ped); continue; }
    detalhes++;
    try {
      const full: any = await obterPedidoCompra(deps.client, ped.id);
      const d = full?.data ?? full;
      comItens.push({ ...ped, itens: d?.itens ?? [] });
    } catch {
      comItens.push(ped);
    }
  }

  const idAlvo = deps.contatoId ? String(deps.contatoId) : "";
  const ehProducao = (ped: any) => {
    const contato = ped.contato ?? ped.fornecedor ?? {};
    if (idAlvo && String(contato.id ?? "") === idAlvo) return true;
    return normaliza(contato.nome ?? "").includes(CONTATO_PRODUCAO_NOME);
  };
  const producaoPed = comItens.filter(ehProducao);
  const externoPed = comItens.filter((p) => !ehProducao(p));

  return {
    periodo,
    totalPedidos: comItens.length,
    pedidosProducao: producaoPed.length,
    pedidosExterno: externoPed.length,
    producao: agregaProdutos(producaoPed),
    externo: agregaProdutos(externoPed),
    paginacao: { truncado },
    observacao:
      "Compras = pedidos de compra do período, com quantidade por item. PRODUÇÃO = pedidos do contato 'Fabrica' (o Canastra registra ordem de produção assim). EXTERNO = demais fornecedores (matéria-prima: café verde/insumos). Busca o detalhe de TODOS os pedidos (pode demorar em mês cheio).",
  };
}
