import { describe, it, expect } from "vitest";
import { consultarPedidos } from "../src/tools/consultarPedidos";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = {
  getAllPages: async (path: string) => {
    if (path === "/pedidos/vendas") return { itens: [
      { id: 10, numero: 100, data: "2026-07-02", total: 500, contato: { nome: "UBERMED" } },
      { id: 11, numero: 101, data: "2026-07-03", total: 1200, contato: { nome: "Padaria X" } },
    ], truncado: false };
    return { itens: [], truncado: false };
  },
  get: async (path: string) => {
    if (path === "/pedidos/vendas/11") return { data: { numero: 101, data: "2026-07-03", total: 1200, contato: { nome: "Padaria X" }, itens: [{ descricao: "Café 1kg", quantidade: 3, valor: 70 }] } };
    return { data: {} };
  },
} as any;

describe("consultarPedidos", () => {
  it("maiores ordena por total desc", async () => {
    const r: any = await consultarPedidos({ client, hoje: REF }, { modo: "maiores", periodo: "este_mes" });
    expect(r.pedidos[0].numero).toBe(101);
    expect(r.pedidos[0].total).toBe(1200);
  });
  it("detalhe traz itens do pedido pelo número", async () => {
    const r: any = await consultarPedidos({ client, hoje: REF }, { modo: "detalhe", numero: 101, periodo: "este_mes" });
    expect(r.encontrado).toBe(true);
    expect(r.itens[0].descricao).toBe("Café 1kg");
  });
  it("por_cliente filtra pelo nome", async () => {
    const r: any = await consultarPedidos({ client, hoje: REF }, { modo: "por_cliente", cliente: "padaria", periodo: "este_mes" });
    expect(r.total).toBe(1);
    expect(r.pedidos[0].numero).toBe(101);
  });
});
