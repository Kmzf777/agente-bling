import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("lança erro listando variáveis obrigatórias ausentes", () => {
    expect(() => loadConfig({})).toThrowError(/OPENAI_API_KEY/);
  });

  it("carrega e aplica defaults quando as obrigatórias existem", () => {
    const cfg = loadConfig({
      OPENAI_API_KEY: "k", BLING_CLIENT_ID: "id", BLING_CLIENT_SECRET: "sec",
      APP_PASSWORD: "p", SESSION_SECRET: "s",
    });
    expect(cfg.openaiModel).toBe("gpt-4.1-mini");
    expect(cfg.port).toBe(3000);
    expect(cfg.blingSituacaoFaturadoIds).toEqual([]);
  });

  it("parseia IDs de situação separados por vírgula", () => {
    const cfg = loadConfig({
      OPENAI_API_KEY: "k", BLING_CLIENT_ID: "id", BLING_CLIENT_SECRET: "sec",
      APP_PASSWORD: "p", SESSION_SECRET: "s", BLING_SITUACAO_FATURADO_IDS: "9, 12 ,15",
    });
    expect(cfg.blingSituacaoFaturadoIds).toEqual([9, 12, 15]);
  });
});
