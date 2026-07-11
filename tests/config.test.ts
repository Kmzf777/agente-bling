import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("lança erro listando variáveis obrigatórias ausentes", () => {
    expect(() => loadConfig({})).toThrowError(/ANTHROPIC_API_KEY/);
  });

  it("carrega e aplica defaults quando as obrigatórias existem", () => {
    const cfg = loadConfig({
      ANTHROPIC_API_KEY: "k", BLING_CLIENT_ID: "id", BLING_CLIENT_SECRET: "sec",
      APP_PASSWORD: "p", SESSION_SECRET: "s",
    });
    expect(cfg.anthropicModel).toBe("claude-haiku-4-5");
    expect(cfg.port).toBe(3000);
    expect(cfg.blingSituacaoFaturadoIds).toEqual([]);
  });

  it("parseia IDs de situação separados por vírgula", () => {
    const cfg = loadConfig({
      ANTHROPIC_API_KEY: "k", BLING_CLIENT_ID: "id", BLING_CLIENT_SECRET: "sec",
      APP_PASSWORD: "p", SESSION_SECRET: "s", BLING_SITUACAO_FATURADO_IDS: "9, 12 ,15",
    });
    expect(cfg.blingSituacaoFaturadoIds).toEqual([9, 12, 15]);
  });
});
