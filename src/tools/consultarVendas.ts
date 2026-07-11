import type { BlingClient } from "../bling/blingClient";
import { listarPedidosVenda } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface VendasDeps { client: BlingClient; hoje?: Date; }
export interface VendasArgs { periodo: Periodo; dataInicial?: string; dataFinal?: string; }

export async function consultarVendas(deps: VendasDeps, args: VendasArgs) {
  const periodo = resolverPeriodo(args.periodo, deps.hoje ?? new Date(), args.dataInicial, args.dataFinal);
  const pedidos = await listarPedidosVenda(deps.client, periodo);
  const valorTotal = pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const numeroPedidos = pedidos.length;
  return {
    periodo,
    numeroPedidos,
    valorTotal: Math.round(valorTotal * 100) / 100,
    ticketMedio: numeroPedidos ? Math.round((valorTotal / numeroPedidos) * 100) / 100 : 0,
  };
}
