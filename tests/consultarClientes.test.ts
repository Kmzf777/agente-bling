import { describe, it, expect } from "vitest";
import { consultarClientes } from "../src/tools/consultarClientes";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = {
  getAllPages: async (path: string) => {
    if (path === "/contatos") return { itens: [
      { id: 1, nome: "Alessandro Garla", numeroDocumento: "111", telefone: "(14) 9999" },
      { id: 2, nome: "João Alves", numeroDocumento: "222", telefone: "(99) 8888" },
    ], truncado: false };
    if (path === "/pedidos/vendas") return { itens: [
      { total: 100, contato: { id: 1, nome: "Alessandro Garla" } },
      { total: 300, contato: { id: 2, nome: "João Alves" } },
      { total: 50, contato: { id: 1, nome: "Alessandro Garla" } },
    ], truncado: false };
    return { itens: [], truncado: false };
  },
} as any;

describe("consultarClientes", () => {
  it("contagem retorna total de contatos", async () => {
    const r: any = await consultarClientes({ client }, { modo: "contagem" });
    expect(r.total).toBe(2);
  });
  it("busca por nome (sem acento)", async () => {
    const r: any = await consultarClientes({ client }, { modo: "busca", termo: "joão" });
    expect(r.clientes).toHaveLength(1);
    expect(r.clientes[0].id).toBe(2);
  });
  it("maiores soma por cliente no período", async () => {
    const r: any = await consultarClientes({ client, hoje: REF }, { modo: "maiores", periodo: "este_mes" });
    expect(r.clientes[0].nome).toBe("João Alves");
    expect(r.clientes[0].totalComprado).toBe(300);
    expect(r.clientes[1].totalComprado).toBe(150);
  });
});
