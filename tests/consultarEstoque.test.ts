import { describe, it, expect } from "vitest";
import { consultarEstoque } from "../src/tools/consultarEstoque";

const client = {
  getAllPages: async (path: string) => {
    if (path === "/produtos") return [
      { id: 1, nome: "Café Torrado 250g", codigo: "CT250", estoque: { minimo: 20 } },
      { id: 2, nome: "Café Moído 500g", codigo: "CM500", estoque: { minimo: 5 } },
    ];
    if (path === "/estoques/saldos") return [
      { produto: { id: 1 }, saldoVirtualTotal: 8 },
      { produto: { id: 2 }, saldoVirtualTotal: 40 },
    ];
    return [];
  },
} as any;

describe("consultarEstoque", () => {
  it("filtra itens abaixo do mínimo", async () => {
    const r = await consultarEstoque({ client }, { filtro: "abaixo_minimo" });
    expect(r.itens.map((i: any) => i.id)).toEqual([1]);
  });
  it("busca por termo no nome", async () => {
    const r = await consultarEstoque({ client }, { filtro: "busca", termo: "moído" });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].id).toBe(2);
  });
});
