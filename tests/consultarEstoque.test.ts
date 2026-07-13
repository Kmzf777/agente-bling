import { describe, it, expect } from "vitest";
import { consultarEstoque } from "../src/tools/consultarEstoque";

const client = {
  getAllPages: async (path: string) => {
    if (path === "/produtos") return [
      { id: 1, nome: "Café Torrado 250g", codigo: "CT250", estoque: { saldoVirtualTotal: 8, minimo: 20 } },
      { id: 2, nome: "Café Moído 500g", codigo: "CM500", estoque: { saldoVirtualTotal: 40, minimo: 5 } },
    ];
    return [];
  },
} as any;

describe("consultarEstoque", () => {
  it("filtra itens abaixo do mínimo usando o saldo do próprio produto", async () => {
    const r = await consultarEstoque({ client }, { filtro: "abaixo_minimo" });
    expect(r.itens.map((i: any) => i.id)).toEqual([1]);
    expect(r.itens[0].saldo).toBe(8);
  });
  it("busca por termo no nome (sem acento)", async () => {
    const r = await consultarEstoque({ client }, { filtro: "busca", termo: "moído" });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].id).toBe(2);
  });
  it("todos retorna todos os produtos", async () => {
    const r = await consultarEstoque({ client }, { filtro: "todos" });
    expect(r.total).toBe(2);
  });
});
