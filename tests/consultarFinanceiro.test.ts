import { describe, it, expect } from "vitest";
import { consultarFinanceiro } from "../src/tools/consultarFinanceiro";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = {
  getAllPages: async (path: string) => {
    if (path === "/contas/receber") return { itens: [
      { valor: 100, vencimento: "2026-07-05", contato: { nome: "Cliente A" } },
      { valor: 200, vencimento: "2026-08-01", contato: { nome: "Cliente B" } },
    ], truncado: false };
    if (path === "/contas/pagar") return { itens: [{ valor: 50, vencimento: "2026-07-03", contato: { id: 9 } }], truncado: false };
    return { itens: [], truncado: false };
  },
} as any;

describe("consultarFinanceiro", () => {
  it("a_receber soma tudo quando não há período", async () => {
    const r: any = await consultarFinanceiro({ client, hoje: REF }, { tipo: "a_receber" });
    expect(r.total).toBe(300);
    expect(r.quantidade).toBe(2);
  });
  it("a_receber filtra por vencimento no período (este_mes = 01..08/07)", async () => {
    const r: any = await consultarFinanceiro({ client, hoje: REF }, { tipo: "a_receber", periodo: "este_mes" });
    expect(r.total).toBe(100);
    expect(r.quantidade).toBe(1);
  });
  it("a_pagar soma contas a pagar", async () => {
    const r: any = await consultarFinanceiro({ client, hoje: REF }, { tipo: "a_pagar" });
    expect(r.total).toBe(50);
  });
});
