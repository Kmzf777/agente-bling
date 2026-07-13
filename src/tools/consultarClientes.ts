import type { BlingClient } from "../bling/blingClient";
import { listarContatos, listarPedidosVenda } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface ClientesDeps { client: BlingClient; hoje?: Date; }
export interface ClientesArgs { modo: "contagem" | "busca" | "maiores"; termo?: string; periodo?: Periodo; dataInicial?: string; dataFinal?: string; }

function normaliza(s: string) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

export async function consultarClientes(deps: ClientesDeps, args: ClientesArgs) {
  if (args.modo === "maiores") {
    const periodo = resolverPeriodo(args.periodo ?? "este_mes", deps.hoje ?? new Date(), args.dataInicial, args.dataFinal);
    const pedidos = await listarPedidosVenda(deps.client, periodo);
    const mapa = new Map<number, { nome: string; totalComprado: number; numeroPedidos: number }>();
    for (const p of pedidos) {
      const c = p.contato; if (!c?.id) continue;
      const cur = mapa.get(c.id) ?? { nome: c.nome ?? "(sem nome)", totalComprado: 0, numeroPedidos: 0 };
      cur.totalComprado += Number(p.total) || 0; cur.numeroPedidos += 1;
      mapa.set(c.id, cur);
    }
    const clientes = [...mapa.values()].sort((a, b) => b.totalComprado - a.totalComprado).slice(0, 10)
      .map((x) => ({ ...x, totalComprado: Math.round(x.totalComprado * 100) / 100 }));
    return { modo: "maiores", periodo, clientes };
  }
  const contatos = await listarContatos(deps.client);
  if (args.modo === "contagem") return { modo: "contagem", total: contatos.length };
  const t = normaliza(args.termo || "");
  const clientes = contatos.filter((c) => normaliza(c.nome || "").includes(t)).slice(0, 50)
    .map((c) => ({ id: c.id, nome: c.nome, documento: c.numeroDocumento, telefone: c.telefone }));
  return { modo: "busca", total: clientes.length, clientes };
}
