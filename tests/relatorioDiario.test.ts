import { describe, it, expect } from "vitest";
import { gerarRelatorioDiario } from "../src/tools/relatorioDiario";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = {
  getAllPages: async (path: string) => {
    if (path === "/pedidos/vendas") return [{ total: 100 }];
    if (path === "/produtos") return [{ id: 1, nome: "Café", codigo: "C", estoque: { minimo: 10 } }];
    if (path === "/estoques/saldos") return [{ produto: { id: 1 }, saldoVirtualTotal: 2 }];
    if (path === "/ordens-producao") return [{ id: 1, quantidade: 30, situacao: "concluida" }];
    return [];
  },
} as any;

describe("gerarRelatorioDiario", () => {
  it("consolida vendas, faturamento, estoque crítico e produção", async () => {
    const r = await gerarRelatorioDiario({ client, hoje: REF, situacoesFaturado: [9] }, { data: "hoje" });
    expect(r.vendas.numeroPedidos).toBe(1);
    expect(r.estoqueCritico.total).toBe(1);
    expect(r.producao.quantidadeTotal).toBe(30);
    expect(r.data).toBe("2026-07-08");
  });
});
