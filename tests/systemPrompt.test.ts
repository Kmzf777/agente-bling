import { describe, it, expect } from "vitest";
import { montarSystemPrompt } from "../src/agent/systemPrompt";

describe("montarSystemPrompt", () => {
  it("inclui a data atual e regras anti-alucinação", () => {
    const s = montarSystemPrompt(new Date("2026-07-08T12:00:00-03:00"));
    expect(s).toContain("2026-07-08");
    expect(s.toLowerCase()).toContain("não invente");
    expect(s.toLowerCase()).toContain("ferramentas");
  });
});
