import { describe, it, expect } from "vitest";
import { listarPedidosVenda, listarPedidosCompra, listarOrdensProducao, listarContatos, listarContasReceber, listarContasPagar, listarNotasFiscais, listarNotasConsumidor } from "../src/bling/endpoints";

function fakeClient(pages: any[]) {
  const calls: any[] = [];
  return {
    calls,
    client: { getAllPages: async (path: string, query: any) => { calls.push({ path, query }); return { itens: pages, truncado: false }; } } as any,
  };
}

describe("endpoints", () => {
  it("listarPedidosVenda passa filtro de datas", async () => {
    const { client, calls } = fakeClient([{ id: 1, total: 50 }]);
    const r = await listarPedidosVenda(client, { dataInicial: "2026-07-01", dataFinal: "2026-07-08" });
    expect(calls[0].path).toBe("/pedidos/vendas");
    expect(calls[0].query.dataInicial).toBe("2026-07-01");
    expect(r.itens).toHaveLength(1);
  });
  it("listarPedidosCompra consulta /pedidos/compras com datas", async () => {
    const { client, calls } = fakeClient([{ id: 1 }]);
    const r = await listarPedidosCompra(client, { dataInicial: "2026-07-01", dataFinal: "2026-07-08" });
    expect(calls[0].path).toBe("/pedidos/compras");
    expect(calls[0].query.dataInicial).toBe("2026-07-01");
    expect(r.itens).toHaveLength(1);
  });
  it("listarOrdensProducao aceita filtro opcional", async () => {
    const { client, calls } = fakeClient([]);
    await listarOrdensProducao(client, { dataInicial: "2026-07-01", dataFinal: "2026-07-08" });
    expect(calls[0].path).toBe("/ordens-producao");
  });
  it("listarNotasFiscais consulta /nfe com datas de emissão", async () => {
    const { client, calls } = fakeClient([{ id: 1 }]);
    const r = await listarNotasFiscais(client, { dataInicial: "2026-06-01", dataFinal: "2026-06-30" });
    expect(calls[0].path).toBe("/nfe");
    expect(calls[0].query.dataEmissaoInicial).toBe("2026-06-01");
    expect(calls[0].query.dataEmissaoFinal).toBe("2026-06-30");
    expect(r.itens).toHaveLength(1);
  });
  it("listarNotasFiscais repassa tipo e situacoes quando informados", async () => {
    const { client, calls } = fakeClient([]);
    await listarNotasFiscais(client, { dataInicial: "2026-06-01", dataFinal: "2026-06-30", tipo: 1, situacoes: [5] });
    expect(calls[0].query.tipo).toBe(1);
    expect(calls[0].query["situacoes[]"]).toEqual([5]);
  });
  it("listarNotasConsumidor consulta /nfce (varejo, modelo 65)", async () => {
    const { client, calls } = fakeClient([{ id: 1 }]);
    const r = await listarNotasConsumidor(client, { dataInicial: "2026-06-01", dataFinal: "2026-06-30" });
    expect(calls[0].path).toBe("/nfce");
    expect(calls[0].query.dataEmissaoInicial).toBe("2026-06-01");
    expect(r.itens).toHaveLength(1);
  });
  it("listarContasPagar filtra por situacoes[] e datas de vencimento (server-side)", async () => {
    const { client, calls } = fakeClient([]);
    await listarContasPagar(client, { dataInicial: "2026-06-01", dataFinal: "2026-06-30", situacoes: [1] });
    expect(calls[0].path).toBe("/contas/pagar");
    expect(calls[0].query["situacoes[]"]).toEqual([1]);
    expect(calls[0].query.dataVencimentoInicial).toBe("2026-06-01");
    expect(calls[0].query.dataVencimentoFinal).toBe("2026-06-30");
  });
  it("listarContatos / listarContasReceber / listarContasPagar chamam os recursos certos", async () => {
    const { client, calls } = fakeClient([]);
    await listarContatos(client);
    await listarContasReceber(client);
    await listarContasPagar(client);
    expect(calls.map((c: any) => c.path)).toEqual(["/contatos", "/contas/receber", "/contas/pagar"]);
  });
});
