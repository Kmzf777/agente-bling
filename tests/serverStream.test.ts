import { describe, it, expect } from "vitest";
import request from "supertest";
import { criarApp } from "../src/server";
import { tokenEsperado } from "../src/auth";

const cfg = { appPassword: "segredo", sessionSecret: "s", blingSituacaoFaturadoIds: [], corsOrigin: "*" } as any;

describe("/api/chat/stream (SSE)", () => {
  it("faz stream de eventos de tool + texto e um evento final", async () => {
    const app = criarApp(cfg, {
      runAgent: async () => ({ texto: "ok" }),
      runAgentStream: async ({ onEvent }: any) => {
        onEvent({ tipo: "tool", nome: "consultar_notas_fiscais" });
        onEvent({ tipo: "texto", delta: "Foram " });
        onEvent({ tipo: "texto", delta: "R$ 100." });
        return { texto: "Foram R$ 100." };
      },
    });
    const token = tokenEsperado("s");
    const r = await request(app).post("/api/chat/stream")
      .set("Authorization", `Bearer ${token}`)
      .send({ mensagens: [{ role: "user", content: "cfop?" }] })
      .expect(200);
    expect(r.headers["content-type"]).toContain("text/event-stream");
    expect(r.text).toContain('"tipo":"tool"');
    expect(r.text).toContain("consultar_notas_fiscais");
    expect(r.text).toContain('"tipo":"fim"');
    expect(r.text).toContain("Foram R$ 100.");
  });

  it("repassa tool_inicio e tool_fim no SSE", async () => {
    const app = criarApp(cfg, {
      runAgent: async () => ({ texto: "ok" }),
      runAgentStream: async ({ onEvent }: any) => {
        onEvent({ tipo: "tool_inicio", id: "c1", nome: "consultar_notas_fiscais", args: { periodo: "mes_passado" } });
        onEvent({ tipo: "tool_fim", id: "c1", resumo: "3 NF-e · venda R$ 45.000" });
        return { texto: "pronto" };
      },
    });
    const token = tokenEsperado("s");
    const r = await request(app).post("/api/chat/stream")
      .set("Authorization", `Bearer ${token}`)
      .send({ mensagens: [] })
      .expect(200);
    expect(r.text).toContain('"tipo":"tool_inicio"');
    expect(r.text).toContain('"nome":"consultar_notas_fiscais"');
    expect(r.text).toContain('"tipo":"tool_fim"');
    expect(r.text).toContain("R$ 45.000");
  });

  it("exige autenticação", async () => {
    const app = criarApp(cfg, { runAgent: async () => ({ texto: "ok" }) });
    await request(app).post("/api/chat/stream").send({ mensagens: [] }).expect(401);
  });
});
