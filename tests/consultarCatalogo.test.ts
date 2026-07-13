import { describe, it, expect } from "vitest";
import { consultarCatalogo } from "../src/tools/consultarCatalogo";

const client = {
  getAllPages: async (path: string) => {
    if (path === "/produtos") return [
      { id: 1, nome: "Café Caro", codigo: "A", preco: 100, precoCusto: 40, estoque: { saldoVirtualTotal: 5 } },
      { id: 2, nome: "Café Barato", codigo: "B", preco: 10, precoCusto: 4, estoque: { saldoVirtualTotal: 50 } },
    ];
    return [];
  },
} as any;

describe("consultarCatalogo", () => {
  it("contagem", async () => {
    const r: any = await consultarCatalogo({ client }, { modo: "contagem" });
    expect(r.total).toBe(2);
  });
  it("mais_caros ordena por preço desc", async () => {
    const r: any = await consultarCatalogo({ client }, { modo: "mais_caros" });
    expect(r.produtos[0].nome).toBe("Café Caro");
    expect(r.produtos[0].preco).toBe(100);
  });
  it("busca por nome", async () => {
    const r: any = await consultarCatalogo({ client }, { modo: "busca", termo: "barato" });
    expect(r.produtos).toHaveLength(1);
    expect(r.produtos[0].id).toBe(2);
  });
});
