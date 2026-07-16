import { readFileSync } from "node:fs";

/**
 * Base de conhecimento COMPLETA de gestão de café especial.
 * Carregada sob demanda pela tool `contexto_cafe` — NÃO vai no system prompt (economia de tokens).
 */
export const CONHECIMENTO_CAFE = readFileSync(new URL("./conhecimento.md", import.meta.url), "utf8");
