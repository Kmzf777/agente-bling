import { describe, it, expect } from "vitest";
import { gerarRelatorioDiario } from "../src/tools/relatorioDiario";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = {
  getAllPages: async (path: string) => {
    if (path === "/pedidos/vendas") return { itens: [{ total: 100 }], truncado: false };
    if (path === "/produtos") return { itens: [{ id: 1, nome: "Café", codigo: "C", estoque: { saldoVirtualTotal: 2, minimo: 10 } }], truncado: false };
    if (path === "/pedidos/compras") return { itens: [{ numero: 1, data: "2026-07-08", total: 500, contato: { nome: "Fabrica" } }], truncado: false };
    return { itens: [], truncado: false };
  },
} as any;

describe("gerarRelatorioDiario", () => {
  it("consolida vendas, faturamento, estoque crítico e produção", async () => {
    const r = await gerarRelatorioDiario({ client, hoje: REF, situacoesFaturado: [9] }, { data: "hoje" });
    expect((r.vendas as any).numeroPedidos).toBe(1);
    expect((r.estoqueCritico as any).total).toBe(1);
    expect((r.producao as any).numeroOrdens).toBe(1);
    expect(r.data).toBe("2026-07-08");
  });

  it("é resiliente: se uma seção falha, o relatório ainda retorna as demais", async () => {
    const clienteRuim = {
      getAllPages: async (path: string) => {
        if (path === "/produtos") throw new Error("Bling GET /produtos falhou (HTTP 400)");
        if (path === "/pedidos/vendas") return { itens: [{ total: 50 }], truncado: false };
        return { itens: [], truncado: false };
      },
    } as any;
    const r = await gerarRelatorioDiario({ client: clienteRuim, hoje: REF, situacoesFaturado: [] }, { data: "hoje" });
    expect((r.vendas as any).numeroPedidos).toBe(1);
    expect((r.estoqueCritico as any).erro).toContain("400");
  });
});
