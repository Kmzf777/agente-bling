import { describe, it, expect } from "vitest";
import { consultarFaturamento } from "../src/tools/consultarFaturamento";

const REF = new Date("2026-07-08T12:00:00-03:00");

describe("consultarFaturamento", () => {
  it("soma faturamento do período filtrando por situação", async () => {
    const calls: any[] = [];
    const client = { getAllPages: async (_p: string, q: any) => { calls.push(q); return [{ total: 200 }, { total: 300 }]; } } as any;
    const r = await consultarFaturamento({ client, hoje: REF, situacoesFaturado: [9] }, { periodo: "hoje" });
    expect(r.faturamento).toBe(500);
    expect(calls[0]["idsSituacoes[]"]).toEqual([9]);
  });
});
