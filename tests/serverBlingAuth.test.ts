import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { criarApp } from "../src/server";

const cfg = { appPassword: "x", sessionSecret: "s", blingSituacaoFaturadoIds: [], corsOrigin: "*" } as any;

function appComOAuth(exchangeCode = vi.fn(async () => {})) {
  const app = criarApp(cfg, {
    runAgent: async () => ({ texto: "ok" }),
    blingOAuth: {
      clientId: "CID",
      redirectUri: "http://vps.exemplo/api/bling/callback",
      exchangeCode,
    },
  });
  return { app, exchangeCode };
}

describe("OAuth Bling no servidor (somente leitura — só autenticação)", () => {
  it("GET /api/bling/auth redireciona para o authorize do Bling com client_id e state", async () => {
    const { app } = appComOAuth();
    const r = await request(app).get("/api/bling/auth").expect(302);
    const loc = r.headers["location"];
    expect(loc).toContain("https://www.bling.com.br/Api/v3/oauth/authorize");
    expect(loc).toContain("client_id=CID");
    expect(loc).toContain("redirect_uri=");
    expect(loc).toMatch(/state=[a-f0-9]+/);
  });

  it("callback com state válido troca o code por token e responde sucesso", async () => {
    const { app, exchangeCode } = appComOAuth();
    const auth = await request(app).get("/api/bling/auth").expect(302);
    const state = new URL(auth.headers["location"]).searchParams.get("state")!;
    const r = await request(app).get(`/api/bling/callback?code=ABC&state=${state}`).expect(200);
    expect(exchangeCode).toHaveBeenCalledWith("ABC", "http://vps.exemplo/api/bling/callback");
    expect(r.text.toLowerCase()).toContain("bling conectado");
  });

  it("callback com state inválido NÃO troca o code (400)", async () => {
    const { app, exchangeCode } = appComOAuth();
    await request(app).get("/api/bling/callback?code=ABC&state=forjado").expect(400);
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("sem blingOAuth configurado, as rotas não existem (não quebram o app)", async () => {
    const app = criarApp(cfg, { runAgent: async () => ({ texto: "ok" }) });
    await request(app).get("/api/bling/auth").expect(404);
  });
});
