import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";

const baseEnv = {
  ANTHROPIC_API_KEY: "ant-key",
  BLING_CLIENT_ID: "id",
  BLING_CLIENT_SECRET: "sec",
  APP_PASSWORD: "p",
  SESSION_SECRET: "s",
};

describe("loadConfig", () => {
  it("lança erro listando variáveis obrigatórias ausentes", () => {
    expect(() => loadConfig({})).toThrowError(/ANTHROPIC_API_KEY/);
  });

  it("carrega e aplica defaults quando as obrigatórias existem", () => {
    const cfg = loadConfig({ ...baseEnv, OPENAI_API_KEY: "k" });
    expect(cfg.openaiModel).toBe("gpt-4.1-mini");
    expect(cfg.port).toBe(3000);
    expect(cfg.blingSituacaoFaturadoIds).toEqual([]);
  });

  it("parseia IDs de situação separados por vírgula", () => {
    const cfg = loadConfig({ ...baseEnv, BLING_SITUACAO_FATURADO_IDS: "9, 12 ,15" });
    expect(cfg.blingSituacaoFaturadoIds).toEqual([9, 12, 15]);
  });

  it("carrega configuração do provider anthropic com defaults", () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.agentProvider).toBe("anthropic");
    expect(cfg.agentModel).toBe("claude-sonnet-4-6");
    expect(cfg.anthropicApiKey).toBe("ant-key");
    expect(cfg.agentMaxSteps).toBe(20);
  });

  it("AGENT_MODEL sobrescreve o modelo default", () => {
    const cfg = loadConfig({ ...baseEnv, AGENT_MODEL: "claude-opus-4-5" });
    expect(cfg.agentModel).toBe("claude-opus-4-5");
  });
});
