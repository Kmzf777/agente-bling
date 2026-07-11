import { describe, it, expect } from "vitest";
import { BlingClient } from "../src/bling/blingClient";

const tmFake = { getAccessToken: async () => "tok", refresh: async () => "tok2" } as any;

describe("BlingClient", () => {
  it("faz GET com Bearer e retorna data", async () => {
    const fetchImpl = async (url: string, init: any) => {
      expect(init.headers.Authorization).toBe("Bearer tok");
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 1 }] }) } as any;
    };
    const c = new BlingClient({ tokenManager: tmFake, fetchImpl, minIntervalMs: 0 });
    expect(await c.get("/produtos")).toEqual({ data: [{ id: 1 }] });
  });

  it("em 401 renova token e refaz a chamada", async () => {
    let n = 0;
    const fetchImpl = async (_url: string, _init: any) => {
      n++;
      if (n === 1) return { ok: false, status: 401, json: async () => ({}) } as any;
      return { ok: true, status: 200, json: async () => ({ data: [] }) } as any;
    };
    const c = new BlingClient({ tokenManager: tmFake, fetchImpl, minIntervalMs: 0 });
    await c.get("/produtos");
    expect(n).toBe(2);
  });

  it("getAllPages acumula até página incompleta", async () => {
    const fetchImpl = async (url: string) => {
      const pagina = Number(new URL(url).searchParams.get("pagina"));
      const data = pagina === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: i })) : [{ id: 999 }];
      return { ok: true, status: 200, json: async () => ({ data }) } as any;
    };
    const c = new BlingClient({ tokenManager: tmFake, fetchImpl, minIntervalMs: 0 });
    const all = await c.getAllPages("/pedidos/vendas", {}, { limite: 100, maxPaginas: 20 });
    expect(all.length).toBe(101);
  });
});
