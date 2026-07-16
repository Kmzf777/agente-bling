import type { BlingClient } from "../bling/blingClient";
import { listarPedidosCompra } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface ProducaoDeps { client: BlingClient; hoje?: Date; contatoId?: string; }
export interface ProducaoArgs { periodo: Periodo; dataInicial?: string; dataFinal?: string; }

// Café Canastra registra cada ordem de PRODUÇÃO como um PEDIDO DE COMPRA do contato "Fabrica"
// (o Bling antigo não tinha ordem de produção). Então produção = pedidos de compra da Fabrica.
// Casamos pelo ID do contato (robusto); nome "fabrica" fica como fallback.
const CONTATO_PRODUCAO_NOME = "fabrica";
function normaliza(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export async function consultarProducao(deps: ProducaoDeps, args: ProducaoArgs) {
  const periodo = resolverPeriodo(args.periodo, deps.hoje ?? new Date(), args.dataInicial, args.dataFinal);
  const { itens: pedidos, truncado } = await listarPedidosCompra(deps.client, periodo);

  const idAlvo = deps.contatoId ? String(deps.contatoId) : "";
  const daFabrica = pedidos.filter((p: any) => {
    const contato = p.contato ?? p.fornecedor ?? {};
    if (idAlvo && String(contato.id ?? "") === idAlvo) return true;
    return normaliza(contato.nome ?? "").includes(CONTATO_PRODUCAO_NOME);
  });
  const valorTotal = Math.round(daFabrica.reduce((s: number, p: any) => s + (Number(p.total) || 0), 0) * 100) / 100;

  return {
    periodo,
    numeroOrdens: daFabrica.length,
    valorTotal,
    paginacao: { truncado },
    ordens: daFabrica.slice(0, 20).map((p: any) => ({
      numero: p.numero,
      data: p.data,
      total: Number(p.total) || 0,
      situacao: p.situacao?.valor ?? p.situacao?.nome ?? p.situacao ?? null,
    })),
    observacao:
      "Produção = pedidos de compra do contato 'Fabrica' (o Canastra registra ordem de produção assim). NÃO usa o módulo de ordens de produção do Bling.",
  };
}
