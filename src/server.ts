import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { exigirAuth } from "./auth";
import type { AppConfig } from "./config";

export interface ServerDeps {
  runAgent: (args: { mensagens: unknown[] }) => Promise<{ texto: string }>;
}

export function criarApp(cfg: AppConfig, deps: ServerDeps): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(cfg.sessionSecret));

  app.post("/api/login", (req, res) => {
    if (req.body?.senha === cfg.appPassword) {
      res.cookie("auth", "1", { httpOnly: true, signed: true, sameSite: "lax", maxAge: 7 * 24 * 3600 * 1000 });
      return res.json({ ok: true });
    }
    res.status(401).json({ erro: "senha inválida" });
  });
  app.post("/api/logout", (_req, res) => { res.clearCookie("auth"); res.json({ ok: true }); });

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

  const webDist = path.resolve("web/dist");
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });

  return app;
}

// Sobe o servidor quando executado diretamente (não em testes)
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { iniciar } = await import("./bootstrap");
  iniciar();
}
