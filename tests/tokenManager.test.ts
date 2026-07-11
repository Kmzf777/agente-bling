import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TokenManager } from "../src/bling/tokenManager";

const tmp = () => path.join(os.tmpdir(), `bling-tok-${Math.random().toString(36).slice(2)}.json`);

describe("TokenManager", () => {
  let file: string;
  beforeEach(async () => { file = tmp(); });

  it("renova quando o token está expirado e persiste o novo", async () => {
    await fs.writeFile(file, JSON.stringify({ access_token: "velho", refresh_token: "r1", expires_at: 1000 }));
    const calls: any[] = [];
    const fetchImpl = async (url: string, init: any) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ access_token: "novo", refresh_token: "r2", expires_in: 3600 }) } as any;
    };
    const tm = new TokenManager({ clientId: "c", clientSecret: "s", tokenFile: file, fetchImpl, now: () => 2_000_000 });
    const tok = await tm.getAccessToken();
    expect(tok).toBe("novo");
    expect(calls[0].url).toContain("/oauth/token");
    expect(calls[0].init.headers.Authorization).toBe("Basic " + Buffer.from("c:s").toString("base64"));
    expect(calls[0].init.body).toContain("grant_type=refresh_token");
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    expect(saved.access_token).toBe("novo");
    expect(saved.refresh_token).toBe("r2");
  });

  it("não renova quando o token ainda é válido", async () => {
    await fs.writeFile(file, JSON.stringify({ access_token: "ok", refresh_token: "r", expires_at: 9_999_999_999 }));
    let called = false;
    const tm = new TokenManager({ clientId: "c", clientSecret: "s", tokenFile: file,
      fetchImpl: async () => { called = true; return {} as any; }, now: () => 1000 });
    expect(await tm.getAccessToken()).toBe("ok");
    expect(called).toBe(false);
  });
});
