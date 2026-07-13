import { describe, it, expect } from "vitest";
import { montarSystemPrompt } from "../src/agent/systemPrompt";

describe("montarSystemPrompt", () => {
  it("inclui data, persona de consultor e a base de conhecimento", () => {
    const s = montarSystemPrompt(new Date("2026-07-08T12:00:00-03:00"));
    expect(s).toContain("2026-07-08");
    expect(s.toLowerCase()).toContain("consultor");
    expect(s.toLowerCase()).toContain("invente");
    expect(s.toLowerCase()).toContain("ferramentas");
    expect(s.toLowerCase()).toContain("perecível");
  });
});
