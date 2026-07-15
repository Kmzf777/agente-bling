import { describe, it, expect } from "vitest";
import { consultarApi } from "../src/tools/consultarApi";

describe("consultarApi (escape hatch)", () => {
  it("rejeita path fora da whitelist de leitura", async () => {
    const client: any = { get: async () => ({}), getAllPages: async () => ({ itens: [], truncado: false }) };
    await expect(consultarApi({ client }, { path: "/usuarios" })).rejects.toThrow(/leitura/i);
  });

  it("consulta path permitido com todasPaginas e devolve dados + truncado", async () => {
    const client: any = { getAllPages: async () => ({ itens: [{ id: 1 }], truncado: true }) };
    const r: any = await consultarApi({ client }, { path: "/nfe", todasPaginas: true });
    expect(r.dados).toHaveLength(1);
    expect(r.paginacao.truncado).toBe(true);
  });

  it("sem todasPaginas usa GET simples e devolve data", async () => {
    const calls: any[] = [];
    const client: any = { get: async (path: string, params: any) => { calls.push({ path, params }); return { data: [{ id: 9 }] }; } };
    const r: any = await consultarApi({ client }, { path: "/produtos/9" });
    expect(r.dados).toEqual([{ id: 9 }]);
    expect(calls[0].path).toBe("/produtos/9");
  });
});
