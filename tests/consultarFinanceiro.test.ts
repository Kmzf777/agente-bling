import { describe, it, expect } from "vitest";
import { consultarFinanceiro } from "../src/tools/consultarFinanceiro";

const REF = new Date("2026-07-15T12:00:00-03:00");

describe("consultarFinanceiro", () => {
  it("separa pago x em aberto por situação (2 = pago; demais = em aberto)", async () => {
    const contas = [
      { valor: 100, vencimento: "2026-06-10", situacao: 2, contato: { nome: "A" } }, // pago
      { valor: 50, vencimento: "2026-06-20", situacao: 1, contato: { nome: "B" } },  // em aberto
      { valor: 25, vencimento: "2026-06-22", situacao: 3, contato: { nome: "C" } },  // parcial -> em aberto
    ];
    const client: any = { getAllPages: async () => ({ itens: contas, truncado: false }) };
    const r: any = await consultarFinanceiro({ client, hoje: REF }, { tipo: "a_pagar", periodo: "mes_passado" });
    expect(r.total).toBe(175);
    expect(r.totalPago).toBe(100);
    expect(r.totalEmAberto).toBe(75);
    expect(r.quantidadePago).toBe(1);
    expect(r.quantidadeEmAberto).toBe(2);
  });

  it("aplica o período como filtro server-side de vencimento", async () => {
    const calls: any[] = [];
    const client: any = { getAllPages: async (path: string, query: any) => { calls.push({ path, query }); return { itens: [], truncado: false }; } };
    await consultarFinanceiro({ client, hoje: REF }, { tipo: "a_receber", periodo: "mes_passado" });
    expect(calls[0].path).toBe("/contas/receber");
    expect(calls[0].query.dataVencimentoInicial).toBe("2026-06-01");
    expect(calls[0].query.dataVencimentoFinal).toBe("2026-06-30");
  });

  it("a_pagar consulta /contas/pagar", async () => {
    const calls: any[] = [];
    const client: any = { getAllPages: async (path: string) => { calls.push({ path }); return { itens: [], truncado: false }; } };
    await consultarFinanceiro({ client, hoje: REF }, { tipo: "a_pagar" });
    expect(calls[0].path).toBe("/contas/pagar");
  });
});
