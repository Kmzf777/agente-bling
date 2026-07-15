import type { BlingClient } from "../bling/blingClient";
import { listarPedidosVenda, obterPedidoVenda } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface PedidosDeps { client: BlingClient; hoje?: Date; }
export interface PedidosArgs { modo: "maiores" | "detalhe" | "por_cliente"; periodo?: Periodo; numero?: string | number; cliente?: string; dataInicial?: string; dataFinal?: string; }

function normaliza(s: string) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

export async function consultarPedidos(deps: PedidosDeps, args: PedidosArgs) {
  const periodo = resolverPeriodo(args.periodo ?? "este_mes", deps.hoje ?? new Date(), args.dataInicial, args.dataFinal);
  const { itens: pedidos } = await listarPedidosVenda(deps.client, periodo);

  if (args.modo === "detalhe") {
    const alvo = pedidos.find((p) => String(p.numero) === String(args.numero));
    if (!alvo) return { modo: "detalhe", encontrado: false, mensagem: `Pedido ${args.numero} não encontrado no período ${periodo.dataInicial}..${periodo.dataFinal}.` };
    const full: any = await obterPedidoVenda(deps.client, alvo.id);
    const d = full.data ?? full;
    return {
      modo: "detalhe", encontrado: true,
      numero: d.numero, data: d.data, total: Number(d.total) || 0, cliente: d.contato?.nome ?? null,
      itens: (d.itens ?? []).map((i: any) => ({ descricao: i.descricao, quantidade: Number(i.quantidade) || 0, valor: Number(i.valor) || 0 })),
    };
  }
  if (args.modo === "por_cliente") {
    const t = normaliza(args.cliente || "");
    const pedidosCliente = pedidos.filter((p) => normaliza(p.contato?.nome || "").includes(t))
      .map((p) => ({ numero: p.numero, data: p.data, total: Number(p.total) || 0 }));
    return { modo: "por_cliente", periodo, total: pedidosCliente.length, pedidos: pedidosCliente.slice(0, 50) };
  }
  const maiores = [...pedidos].sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0)).slice(0, 10)
    .map((p) => ({ numero: p.numero, data: p.data, total: Number(p.total) || 0, cliente: p.contato?.nome ?? null }));
  return { modo: "maiores", periodo, pedidos: maiores };
}
