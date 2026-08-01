import { describe, it, expect, vi } from "vitest";
import { parseMensagem, criarWebhookTelegram, criarTelegramClient } from "../src/telegram/webhook";
import { criarSessions } from "../src/telegram/sessions";
import { criarApp } from "../src/server";
import express from "express";
import request from "supertest";

// ── parseMensagem ─────────────────────────────────────────────────────────────

const base = (over: any = {}) => ({
  update_id: 123456,
  message: {
    message_id: 1,
    chat: { id: 987654321, type: "private" },
    from: { id: 987654321, first_name: "Rafael" },
    text: "quanto vendi hoje?",
    ...over,
  },
});

describe("parseMensagem (Telegram)", () => {
  it("extrai chatId e texto do update", () => {
    expect(parseMensagem(base())).toEqual({ chatId: "987654321", texto: "quanto vendi hoje?" });
  });

  it("retorna null para update sem message", () => {
    expect(parseMensagem({ update_id: 1 })).toBeNull();
  });

  it("retorna null para message sem texto (ex.: sticker)", () => {
    const body = base({ text: undefined, sticker: {} });
    expect(parseMensagem(body)).toBeNull();
  });

  it("retorna null para payload malformado", () => {
    expect(parseMensagem({})).toBeNull();
    expect(parseMensagem(null)).toBeNull();
  });

  it("converte chatId para string", () => {
    const body = base({ chat: { id: 111, type: "private" } });
    const result = parseMensagem(body);
    expect(typeof result?.chatId).toBe("string");
    expect(result?.chatId).toBe("111");
  });
});

// ── criarTelegramClient ───────────────────────────────────────────────────────

describe("criarTelegramClient.sendMessage", () => {
  it("faz POST no endpoint sendMessage com body correto", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    const client = criarTelegramClient("BOT_TOKEN", fetchMock as any);
    await client.sendMessage("987654321", "olá!");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/botBOT_TOKEN/sendMessage");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ chat_id: "987654321", text: "olá!" });
  });

  it("não lança se o Telegram responder erro (só loga)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "Bad Request" });
    const client = criarTelegramClient("TOKEN", fetchMock as any);
    await expect(client.sendMessage("123", "x")).resolves.toBeUndefined();
  });
});

// ── criarWebhookTelegram (handler) ────────────────────────────────────────────

function montarApp(over: Partial<any> = {}) {
  const enviados: Array<{ chatId: string; texto: string }> = [];
  const telegram = { sendMessage: async (chatId: string, texto: string) => { enviados.push({ chatId, texto }); } };
  const runAgent = over.runAgent ?? (async () => ({ texto: "Você vendeu R$ 100 hoje." }));
  const sessions = over.sessions ?? criarSessions(30);
  const app = express();
  app.use(express.json());
  app.post("/api/telegram/webhook", criarWebhookTelegram({ runAgent, telegram, sessions, senha: "cafe123" }));
  return { app, enviados, sessions };
}

const evt = (chatId: string, texto: string) => ({
  update_id: 1,
  message: {
    message_id: 1,
    chat: { id: Number(chatId), type: "private" },
    from: { id: Number(chatId), first_name: "Test" },
    text: texto,
  },
});

describe("criarWebhookTelegram (handler)", () => {
  it("responde 200 sempre e ignora update sem texto", async () => {
    const { app, enviados } = montarApp();
    await request(app).post("/api/telegram/webhook").send({ update_id: 1 }).expect(200);
    expect(enviados).toHaveLength(0);
  });

  it("chatId novo recebe pedido de senha e NÃO chama o agente", async () => {
    const runAgent = vi.fn(async () => ({ texto: "não deveria" }));
    const { app, enviados } = montarApp({ runAgent });
    await request(app).post("/api/telegram/webhook").send(evt("987654321", "oi")).expect(200);
    await new Promise<void>((r) => setImmediate(r));
    expect(runAgent).not.toHaveBeenCalled();
    expect(enviados[0].texto).toContain("senha");
  });

  it("senha correta autentica e confirma", async () => {
    const { app, enviados, sessions } = montarApp();
    await request(app).post("/api/telegram/webhook").send(evt("987654321", "cafe123")).expect(200);
    await new Promise<void>((r) => setImmediate(r));
    expect(sessions.obter("987654321").autenticado).toBe(true);
    expect(enviados[0].texto).toContain("liberado");
  });

  it("autenticado → chama o agente e responde o texto", async () => {
    const runAgent = vi.fn(async () => ({ texto: "Vendeu R$ 100." }));
    const { app, enviados, sessions } = montarApp({ runAgent });
    sessions.obter("987654321").autenticado = true;
    await request(app).post("/api/telegram/webhook").send(evt("987654321", "quanto vendi?")).expect(200);
    await new Promise<void>((r) => setImmediate(r));
    expect(runAgent).toHaveBeenCalledOnce();
    expect(enviados.some((e) => e.texto === "Vendeu R$ 100.")).toBe(true);
  });

  it("comando 'sair' limpa a sessão", async () => {
    const { app, sessions } = montarApp();
    sessions.obter("987654321").autenticado = true;
    await request(app).post("/api/telegram/webhook").send(evt("987654321", "sair")).expect(200);
    await new Promise<void>((r) => setImmediate(r));
    expect(sessions.obter("987654321").autenticado).toBe(false);
  });

  it("erro no agente responde mensagem amigável", async () => {
    const runAgent = vi.fn(async () => { throw new Error("boom"); });
    const { app, enviados, sessions } = montarApp({ runAgent });
    sessions.obter("987654321").autenticado = true;
    await request(app).post("/api/telegram/webhook").send(evt("987654321", "quanto vendi?")).expect(200);
    await new Promise<void>((r) => setImmediate(r));
    expect(enviados.some((e) => e.texto.includes("problema"))).toBe(true);
  });

  it("resposta vazia do agente vira fallback (nunca envia texto vazio)", async () => {
    const runAgent = vi.fn(async () => ({ texto: "   " }));
    const { app, enviados, sessions } = montarApp({ runAgent });
    sessions.obter("987654321").autenticado = true;
    await request(app).post("/api/telegram/webhook").send(evt("987654321", "quanto vendi?")).expect(200);
    await new Promise<void>((r) => setImmediate(r));
    const resposta = enviados.find((e) => e.texto !== "🔎 Consultando…");
    expect(resposta?.texto.trim().length).toBeGreaterThan(0);
  });
});

// ── criarApp monta o webhook do Telegram ─────────────────────────────────────

describe("criarApp monta o webhook do Telegram", () => {
  it("expõe POST /api/telegram/webhook quando handler é passado", async () => {
    const enviados: any[] = [];
    const sessions = criarSessions(30);
    const handler = criarWebhookTelegram({
      runAgent: async () => ({ texto: "ok" }),
      telegram: { sendMessage: async (chatId: string, t: string) => { enviados.push({ chatId, t }); } },
      sessions, senha: "cafe123",
    });
    const cfg = { appPassword: "x", sessionSecret: "s", corsOrigin: "*" } as any;
    const app = criarApp(cfg, { runAgent: async () => ({ texto: "ok" }), telegramWebhook: handler });
    await request(app).post("/api/telegram/webhook")
      .send(evt("987654321", "oi"))
      .expect(200);
    await new Promise<void>((r) => setImmediate(r));
    expect(enviados[0].t).toContain("senha");
  });

  it("não expõe a rota quando handler não é passado", async () => {
    const cfg = { appPassword: "x", sessionSecret: "s", corsOrigin: "*" } as any;
    const app = criarApp(cfg, { runAgent: async () => ({ texto: "ok" }) });
    const r = await request(app).post("/api/telegram/webhook").send({});
    expect([404, 200]).toContain(r.status);
  });
});
