import { describe, it, expect } from "vitest";
import { BlingClient } from "../src/bling/blingClient";

const tmFake = { getAccessToken: async () => "tok", forceRefresh: async () => "tok2" } as any;

describe("BlingClient", () => {
  it("faz GET com Bearer e retorna data", async () => {
    const fetchImpl = async (url: any, init?: any) => {
      expect(init.headers.Authorization).toBe("Bearer tok");
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 1 }] }) } as any;
    };
    const c = new BlingClient({ tokenManager: tmFake, fetchImpl, minIntervalMs: 0 });
    expect(await c.get("/produtos")).toEqual({ data: [{ id: 1 }] });
  });

  it("em 401 força refresh e refaz a chamada", async () => {
    let n = 0; let refreshed = false;
    const tm = { getAccessToken: async () => "tok", forceRefresh: async () => { refreshed = true; return "tok2"; } } as any;
    const fetchImpl = async (_url: any, _init?: any) => {
      n++;
      if (n === 1) return { ok: false, status: 401, json: async () => ({}) } as any;
      return { ok: true, status: 200, json: async () => ({ data: [] }) } as any;
    };
    const c = new BlingClient({ tokenManager: tm, fetchImpl, minIntervalMs: 0 });
    await c.get("/produtos");
    expect(n).toBe(2);
    expect(refreshed).toBe(true);
  });

  it("getAllPages acumula até página incompleta", async () => {
    const fetchImpl = async (url: any) => {
      const pagina = Number(new URL(url).searchParams.get("pagina"));
      const data = pagina === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: i })) : [{ id: 999 }];
      return { ok: true, status: 200, json: async () => ({ data }) } as any;
    };
    const c = new BlingClient({ tokenManager: tmFake, fetchImpl, minIntervalMs: 0 });
    const all = await c.getAllPages("/pedidos/vendas", {}, { limite: 100, maxPaginas: 20 });
    expect(all.itens.length).toBe(101);
    expect(all.truncado).toBe(false);
  });

  it("getAllPages sinaliza truncado ao bater maxPaginas", async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ data: Array.from({ length: 100 }, (_, i) => ({ id: i })) }) } as any);
    const c = new BlingClient({ tokenManager: tmFake, fetchImpl, minIntervalMs: 0 });
    const r = await c.getAllPages("/x", {}, { limite: 100, maxPaginas: 2 });
    expect(r.itens).toHaveLength(200);
    expect(r.truncado).toBe(true);
  });

  it("codifica arrays como chaves repetidas", async () => {
    let capturedUrl = "";
    const fetchImpl = async (url: any) => { capturedUrl = url; return { ok: true, status: 200, json: async () => ({ data: [] }) } as any; };
    const c = new BlingClient({ tokenManager: tmFake, fetchImpl, minIntervalMs: 0 });
    await c.get("/pedidos/vendas", { "idsSituacoes[]": [9, 12] });
    expect(capturedUrl).toContain("idsSituacoes%5B%5D=9");
    expect(capturedUrl).toContain("idsSituacoes%5B%5D=12");
  });

  it("serializa requisições concorrentes respeitando o intervalo (sem rajada)", async () => {
    const tempos: number[] = [];
    const fetchImpl = async () => { tempos.push(Date.now()); return { ok: true, status: 200, json: async () => ({ data: [] }) } as any; };
    const c = new BlingClient({ tokenManager: tmFake, fetchImpl, minIntervalMs: 40 });
    await Promise.all([c.get("/a"), c.get("/b"), c.get("/c"), c.get("/d")]);
    tempos.sort((a, b) => a - b);
    for (let i = 1; i < tempos.length; i++) {
      expect(tempos[i] - tempos[i - 1]).toBeGreaterThanOrEqual(30);
    }
  });
});
