import { describe, it, expect, vi } from "vitest";
import { parseMensagem } from "../src/whatsapp/webhook";
import { criarWebhookWhatsApp } from "../src/whatsapp/webhook";
import { criarSessions } from "../src/whatsapp/sessions";
import express from "express";
import request from "supertest";

const base = (over: any = {}) => ({
  event: "messages.upsert",
  instance: "canastra",
  data: {
    key: { remoteJid: "5531999@s.whatsapp.net", fromMe: false, id: "abc" },
    message: { conversation: "quanto vendi hoje?" },
    ...over,
  },
});

describe("parseMensagem", () => {
  it("extrai numero e texto de conversation", () => {
    expect(parseMensagem(base())).toEqual({ numero: "5531999", texto: "quanto vendi hoje?" });
  });

  it("extrai texto de extendedTextMessage", () => {
    const body = base({ message: { extendedTextMessage: { text: "e no mês passado?" } } });
    expect(parseMensagem(body)).toEqual({ numero: "5531999", texto: "e no mês passado?" });
  });

  it("ignora mensagens próprias (fromMe)", () => {
    const body = base({ key: { remoteJid: "5531999@s.whatsapp.net", fromMe: true, id: "x" } });
    expect(parseMensagem(body)).toBeNull();
  });

  it("ignora grupos (@g.us)", () => {
    const body = base({ key: { remoteJid: "12345@g.us", fromMe: false, id: "x" } });
    expect(parseMensagem(body)).toBeNull();
  });

  it("ignora mensagens sem texto", () => {
    const body = base({ message: { imageMessage: {} } });
    expect(parseMensagem(body)).toBeNull();
  });

  it("ignora payload malformado", () => {
    expect(parseMensagem({})).toBeNull();
    expect(parseMensagem(null)).toBeNull();
  });
});

// ── Task 5: handler ────────────────────────────────────────────────────────

function montarApp(over: Partial<any> = {}) {
  const enviados: Array<{ numero: string; texto: string }> = [];
  const evolution = { sendText: async (numero: string, texto: string) => { enviados.push({ numero, texto }); } };
  const runAgent = over.runAgent ?? (async () => ({ texto: "Você vendeu R$ 100 hoje." }));
  const sessions = over.sessions ?? criarSessions(30);
  const app = express();
  app.use(express.json());
  app.post("/api/whatsapp/webhook", criarWebhookWhatsApp({ runAgent, evolution, sessions, senha: "cafe123" }));
  return { app, enviados, sessions };
}

const evt = (numero: string, texto: string) => ({
  data: { key: { remoteJid: `${numero}@s.whatsapp.net`, fromMe: false, id: "x" }, message: { conversation: texto } },
});

describe("criarWebhookWhatsApp (handler)", () => {
  it("responde 200 sempre e ignora payload sem texto", async () => {
    const { app, enviados } = montarApp();
    await request(app).post("/api/whatsapp/webhook").send({ data: { key: { remoteJid: "1@g.us" } } }).expect(200);
    expect(enviados).toHaveLength(0);
  });

  it("número novo recebe pedido de senha e NÃO chama o agente", async () => {
    const runAgent = vi.fn(async () => ({ texto: "não deveria" }));
    const { app, enviados } = montarApp({ runAgent });
    await request(app).post("/api/whatsapp/webhook").send(evt("5531999", "oi")).expect(200);
    // Aguarda a microtask queue (processamento async disparado após res.send)
    await new Promise<void>((r) => setImmediate(r));
    expect(runAgent).not.toHaveBeenCalled();
    expect(enviados[0].texto).toContain("senha");
  });

  it("senha correta autentica e confirma", async () => {
    const { app, enviados, sessions } = montarApp();
    await request(app).post("/api/whatsapp/webhook").send(evt("5531999", "cafe123")).expect(200);
    await new Promise<void>((r) => setImmediate(r));
    expect(sessions.obter("5531999").autenticado).toBe(true);
    expect(enviados[0].texto).toContain("liberado");
  });

  it("autenticado → chama o agente e responde o texto", async () => {
    const runAgent = vi.fn(async () => ({ texto: "Vendeu R$ 100." }));
    const { app, enviados, sessions } = montarApp({ runAgent });
    sessions.obter("5531999").autenticado = true;
    await request(app).post("/api/whatsapp/webhook").send(evt("5531999", "quanto vendi?")).expect(200);
    await new Promise<void>((r) => setImmediate(r));
    expect(runAgent).toHaveBeenCalledOnce();
    expect(enviados.some((e) => e.texto === "Vendeu R$ 100.")).toBe(true);
  });

  it("comando 'sair' limpa a sessão", async () => {
    const { app, sessions } = montarApp();
    sessions.obter("5531999").autenticado = true;
    await request(app).post("/api/whatsapp/webhook").send(evt("5531999", "sair")).expect(200);
    await new Promise<void>((r) => setImmediate(r));
    expect(sessions.obter("5531999").autenticado).toBe(false);
  });

  it("erro no agente responde mensagem amigável", async () => {
    const runAgent = vi.fn(async () => { throw new Error("boom"); });
    const { app, enviados, sessions } = montarApp({ runAgent });
    sessions.obter("5531999").autenticado = true;
    await request(app).post("/api/whatsapp/webhook").send(evt("5531999", "quanto vendi?")).expect(200);
    await new Promise<void>((r) => setImmediate(r));
    expect(enviados.some((e) => e.texto.includes("problema"))).toBe(true);
  });
});
