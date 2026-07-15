import { describe, it, expect } from "vitest";
import { consultarVendas } from "../src/tools/consultarVendas";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = { getAllPages: async () => ({ itens: [{ id: 1, total: 100 }, { id: 2, total: 50 }], truncado: false }) } as any;

describe("consultarVendas", () => {
  it("agrega total, contagem e ticket médio", async () => {
    const r = await consultarVendas({ client, hoje: REF }, { periodo: "hoje" });
    expect(r.numeroPedidos).toBe(2);
    expect(r.valorTotal).toBe(150);
    expect(r.ticketMedio).toBe(75);
    expect(r.periodo).toEqual({ dataInicial: "2026-07-08", dataFinal: "2026-07-08" });
  });
  it("lida com período vazio", async () => {
    const vazio = { getAllPages: async () => ({ itens: [], truncado: false }) } as any;
    const r = await consultarVendas({ client: vazio, hoje: REF }, { periodo: "hoje" });
    expect(r.numeroPedidos).toBe(0);
    expect(r.ticketMedio).toBe(0);
  });
});
