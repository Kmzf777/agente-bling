import { describe, it, expect } from "vitest";
import { gerarRelatorioDiario } from "../src/tools/relatorioDiario";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = {
  getAllPages: async (path: string) => {
    if (path === "/pedidos/vendas") return [{ total: 100 }];
    if (path === "/produtos") return [{ id: 1, nome: "Café", codigo: "C", estoque: { saldoVirtualTotal: 2, minimo: 10 } }];
    if (path === "/ordens-producao") return [{ id: 1, quantidade: 30, situacao: "concluida" }];
    return [];
  },
} as any;

describe("gerarRelatorioDiario", () => {
  it("consolida vendas, faturamento, estoque crítico e produção", async () => {
    const r = await gerarRelatorioDiario({ client, hoje: REF, situacoesFaturado: [9] }, { data: "hoje" });
    expect((r.vendas as any).numeroPedidos).toBe(1);
    expect((r.estoqueCritico as any).total).toBe(1);
    expect((r.producao as any).quantidadeTotal).toBe(30);
    expect(r.data).toBe("2026-07-08");
  });

  it("é resiliente: se uma seção falha, o relatório ainda retorna as demais", async () => {
    const clienteRuim = {
      getAllPages: async (path: string) => {
        if (path === "/produtos") throw new Error("Bling GET /produtos falhou (HTTP 400)");
        if (path === "/pedidos/vendas") return [{ total: 50 }];
        return [];
      },
    } as any;
    const r = await gerarRelatorioDiario({ client: clienteRuim, hoje: REF, situacoesFaturado: [] }, { data: "hoje" });
    expect((r.vendas as any).numeroPedidos).toBe(1);
    expect((r.estoqueCritico as any).erro).toContain("400");
  });
});
