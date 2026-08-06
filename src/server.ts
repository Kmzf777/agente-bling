import express, { type Express } from "express";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { criarExigirAuth, tokenEsperado } from "./auth";
import type { AppConfig } from "./config";

export interface ServerDeps {
  runAgent: (args: { mensagens: unknown[] }) => Promise<{ texto: string }>;
  runAgentStream?: (args: { mensagens: unknown[]; onEvent: (ev: unknown) => void }) => Promise<{ texto: string }>;
  telegramWebhook?: import("express").RequestHandler;
  // OAuth do Bling pelo próprio servidor (ex.: na VPS): /api/bling/auth → autoriza →
  // /api/bling/callback troca o code por token. É SOMENTE autenticação — não lê nem
  // escreve dados de negócio no Bling. Registrado só quando fornecido.
  blingOAuth?: {
    clientId: string;
    redirectUri: string;
    exchangeCode: (code: string, redirectUri: string) => Promise<void>;
  };
}

export function criarApp(cfg: AppConfig, deps: ServerDeps): Express {
  const app = express();

  // CORS — o frontend (ex.: Vercel) e o backend (ngrok/local) ficam em origens
  // diferentes. A autenticação é por token no header (não cookie), então liberar a
  // origem é seguro: o acesso continua protegido pelo Bearer token.
  const corsOrigin = cfg.corsOrigin || "*";
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", corsOrigin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, ngrok-skip-browser-warning");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: "1mb" }));

  const token = tokenEsperado(cfg.sessionSecret);
  const exigirAuth = criarExigirAuth(token);

  app.post("/api/login", (req, res) => {
    if (req.body?.senha === cfg.appPassword) return res.json({ token });
    res.status(401).json({ erro: "senha inválida" });
  });

  app.post("/api/chat", exigirAuth, async (req, res) => {
    try {
      const mensagens = req.body?.mensagens ?? [];
      const { texto } = await deps.runAgent({ mensagens });
      res.json({ texto });
    } catch (e) {
      console.error("Erro em /api/chat:", e);
      res.status(500).json({ erro: "falha ao processar a mensagem" });
    }
  });

  // Streaming (SSE): emite eventos de tool-call e de texto conforme o agente trabalha,
  // e um evento final { tipo: "fim", texto }. A UI mostra a timeline + a resposta.
  app.post("/api/chat/stream", exigirAuth, async (req, res) => {
    const mensagens = req.body?.mensagens ?? [];
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const enviar = (ev: unknown) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    try {
      const stream = deps.runAgentStream
        ?? (async (a: { mensagens: unknown[]; onEvent: (ev: unknown) => void }) => deps.runAgent({ mensagens: a.mensagens }));
      const { texto } = await stream({ mensagens, onEvent: enviar });
      enviar({ tipo: "fim", texto });
      res.end();
    } catch (e) {
      console.error("Erro em /api/chat/stream:", e);
      enviar({ tipo: "erro", erro: "falha ao processar a mensagem" });
      res.end();
    }
  });

  // OAuth do Bling pelo próprio servidor (útil na VPS, sem ngrok/local). Abra
  // /api/bling/auth no navegador → autoriza no Bling → callback troca o code por token
  // e salva. SOMENTE autenticação: não faz nenhuma leitura/escrita de dados no Bling.
  if (deps.blingOAuth) {
    const { clientId, redirectUri, exchangeCode } = deps.blingOAuth;
    const estados = new Set<string>(); // states válidos (anti-CSRF), expiram em 10 min
    app.get("/api/bling/auth", (_req, res) => {
      const state = randomBytes(8).toString("hex");
      estados.add(state);
      setTimeout(() => estados.delete(state), 10 * 60 * 1000).unref?.();
      const u =
        `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code` +
        `&client_id=${encodeURIComponent(clientId)}&state=${state}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}`;
      res.redirect(u);
    });
    app.get("/api/bling/callback", async (req, res) => {
      const code = String(req.query.code ?? "");
      const state = String(req.query.state ?? "");
      if (!code || !estados.has(state)) return res.status(400).send("code/state inválido");
      estados.delete(state);
      try {
        await exchangeCode(code, redirectUri);
        res.status(200).send("<h2>Bling conectado! Pode fechar esta aba.</h2>");
      } catch (e) {
        console.error("[bling] callback falhou:", e);
        res.status(500).send("Falha ao conectar o Bling. Tente novamente.");
      }
    });
  }

  // Canal Telegram (Bot API): recebe updates por webhook. Sem Bearer — a proteção é a
  // senha na 1ª mensagem + secret token do Telegram. Registrado só quando o canal está
  // habilitado (deps.telegramWebhook definido).
  if (deps.telegramWebhook) {
    app.post("/api/telegram/webhook", deps.telegramWebhook);
  }

  // Serve o frontend buildado (quando tudo roda local numa porta só).
  const webDist = path.resolve("web/dist");
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });

  return app;
}
