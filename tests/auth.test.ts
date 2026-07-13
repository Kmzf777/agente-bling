import { describe, it, expect } from "vitest";
import request from "supertest";
import { criarApp } from "../src/server";
import { tokenEsperado } from "../src/auth";

const cfg = { appPassword: "segredo", sessionSecret: "s", anthropicModel: "m", blingSituacaoFaturadoIds: [], corsOrigin: "*" } as any;
const app = criarApp(cfg, { runAgent: async () => ({ texto: "ok" }) });

describe("auth", () => {
  it("rejeita /api/chat sem token", async () => {
    await request(app).post("/api/chat").send({ mensagens: [] }).expect(401);
  });
  it("login com senha errada falha", async () => {
    await request(app).post("/api/login").send({ senha: "x" }).expect(401);
  });
  it("login correto devolve token que libera /api/chat", async () => {
    const r = await request(app).post("/api/login").send({ senha: "segredo" }).expect(200);
    expect(r.body.token).toBe(tokenEsperado("s"));
    await request(app).post("/api/chat")
      .set("Authorization", `Bearer ${r.body.token}`)
      .send({ mensagens: [{ role: "user", content: "oi" }] })
      .expect(200);
  });
  it("rejeita token inválido", async () => {
    await request(app).post("/api/chat")
      .set("Authorization", "Bearer errado")
      .send({ mensagens: [] })
      .expect(401);
  });
  it("responde preflight OPTIONS com headers de CORS", async () => {
    const r = await request(app).options("/api/chat").expect(204);
    expect(r.headers["access-control-allow-origin"]).toBe("*");
    expect(r.headers["access-control-allow-headers"]).toContain("Authorization");
  });
});
