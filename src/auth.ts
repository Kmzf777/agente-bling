import type { Request, Response, NextFunction } from "express";
export function exigirAuth(req: Request, res: Response, next: NextFunction) {
  if (req.signedCookies?.auth === "1") return next();
  res.status(401).json({ erro: "não autenticado" });
}
