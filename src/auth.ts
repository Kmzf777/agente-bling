import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/** Token de sessão derivado do SESSION_SECRET (single-user, sem estado no servidor). */
export function tokenEsperado(sessionSecret: string): string {
  return crypto.createHmac("sha256", sessionSecret).update("canastra-auth-v1").digest("hex");
}

function comparaSegura(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Middleware que exige `Authorization: Bearer <token>` igual ao token esperado. */
export function criarExigirAuth(token: string) {
  return function exigirAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.header("authorization") ?? "";
    const enviado = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (enviado && comparaSegura(enviado, token)) return next();
    res.status(401).json({ erro: "não autenticado" });
  };
}
