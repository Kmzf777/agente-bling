import express, { type Express } from "express";
import path from "node:path";
import { criarExigirAuth, tokenEsperado } from "./auth";
import type { AppConfig } from "./config";

export interface ServerDeps {
  runAgent: (args: { mensagens: unknown[] }) => Promise<{ texto: string }>;
  runAgentStream?: (args: { mensagens: unknown[]; onEvent: (ev: unknown) => void }) => Promise<{ texto: string }>;
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

  // Serve o frontend buildado (quando tudo roda local numa porta só).
  const webDist = path.resolve("web/dist");
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });

  return app;
}
