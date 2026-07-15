import { describe, it, expect } from "vitest";
import { criarModelo } from "../src/agent/provider";

describe("provider", () => {
  it("cria um modelo anthropic sem lançar", () => {
    const m = criarModelo({ agentProvider: "anthropic", agentModel: "claude-sonnet-4-6", anthropicApiKey: "sk-ant-test" } as any);
    expect(m).toBeTruthy();
  });
  it("lança se faltar chave do provider ativo", () => {
    expect(() => criarModelo({ agentProvider: "anthropic", agentModel: "x", anthropicApiKey: "" } as any)).toThrow();
  });
  it("lança para provider não suportado", () => {
    expect(() => criarModelo({ agentProvider: "openai", agentModel: "x", anthropicApiKey: "k" } as any)).toThrow(/suportado/i);
  });
});
