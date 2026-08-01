export interface CompraRef { contatoId: number; data: string; }

// Agrupa compras por contato e devolve, para cada um, as `n` datas mais recentes
// (ordem decrescente). Datas no formato AAAA-MM-DD ordenam lexicograficamente =
// cronologicamente. Ignora entradas sem contato ou sem data.
export function ultimasCompras(pedidos: CompraRef[], n = 3): Map<number, string[]> {
  const mapa = new Map<number, string[]>();
  for (const p of pedidos) {
    if (!p?.contatoId || !p?.data) continue;
    const lista = mapa.get(p.contatoId) ?? [];
    lista.push(p.data);
    mapa.set(p.contatoId, lista);
  }
  for (const [id, datas] of mapa) {
    datas.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // desc
    mapa.set(id, datas.slice(0, n));
  }
  return mapa;
}
