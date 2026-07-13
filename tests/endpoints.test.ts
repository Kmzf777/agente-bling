import { describe, it, expect } from "vitest";
import { listarPedidosVenda, listarOrdensProducao, listarContatos, listarContasReceber, listarContasPagar } from "../src/bling/endpoints";

function fakeClient(pages: any[]) {
  const calls: any[] = [];
  return {
    calls,
    client: { getAllPages: async (path: string, query: any) => { calls.push({ path, query }); return pages; } } as any,
  };
}

describe("endpoints", () => {
  it("listarPedidosVenda passa filtro de datas", async () => {
    const { client, calls } = fakeClient([{ id: 1, total: 50 }]);
    const r = await listarPedidosVenda(client, { dataInicial: "2026-07-01", dataFinal: "2026-07-08" });
    expect(calls[0].path).toBe("/pedidos/vendas");
    expect(calls[0].query.dataInicial).toBe("2026-07-01");
    expect(r).toHaveLength(1);
  });
  it("listarOrdensProducao aceita filtro opcional", async () => {
    const { client, calls } = fakeClient([]);
    await listarOrdensProducao(client, { dataInicial: "2026-07-01", dataFinal: "2026-07-08" });
    expect(calls[0].path).toBe("/ordens-producao");
  });
  it("listarContatos / listarContasReceber / listarContasPagar chamam os recursos certos", async () => {
    const { client, calls } = fakeClient([]);
    await listarContatos(client);
    await listarContasReceber(client);
    await listarContasPagar(client);
    expect(calls.map((c: any) => c.path)).toEqual(["/contatos", "/contas/receber", "/contas/pagar"]);
  });
});
