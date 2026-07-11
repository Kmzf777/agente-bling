import { describe, it, expect } from "vitest";
import request from "supertest";
import { criarApp } from "../src/server";

const cfg = { appPassword: "segredo", sessionSecret: "s", anthropicModel: "m", blingSituacaoFaturadoIds: [] } as any;
const app = criarApp(cfg, { runAgent: async () => ({ texto: "ok" }) });

describe("auth", () => {
  it("rejeita /api/chat sem sessão", async () => {
    await request(app).post("/api/chat").send({ mensagens: [] }).expect(401);
  });
  it("login com senha errada falha", async () => {
    await request(app).post("/api/login").send({ senha: "x" }).expect(401);
  });
  it("login correto libera /api/chat", async () => {
    const agent = request.agent(app);
    await agent.post("/api/login").send({ senha: "segredo" }).expect(200);
    await agent.post("/api/chat").send({ mensagens: [{ role: "user", content: "oi" }] }).expect(200);
  });
});
