import { describe, it, expect } from "vitest";
import { montarSystemPrompt } from "../src/agent/systemPrompt";

describe("montarSystemPrompt", () => {
  it("inclui data, persona de facilitador (sem recomendações) e a base de conhecimento", () => {
    const s = montarSystemPrompt(new Date("2026-07-08T12:00:00-03:00"));
    expect(s).toContain("2026-07-08");
    expect(s.toLowerCase()).toContain("facilitador");
    expect(s.toLowerCase()).toContain("invente");
    expect(s.toLowerCase()).toContain("recomend");
    expect(s.toLowerCase()).toContain("ferramentas");
    expect(s.toLowerCase()).toContain("perecível");
    expect(s.toLowerCase()).toContain("clientes");
  });

  it("é capabilities-first: cita NF-e/CFOP, financeiro pago/aberto e instrui autonomia", () => {
    const s = montarSystemPrompt(new Date("2026-07-15T12:00:00-03:00"));
    expect(s).toMatch(/NF-?e|fiscal|CFOP/i);
    expect(s.toLowerCase()).toMatch(/pago|em aberto/);
    expect(s).toMatch(/bling_consultar_api|múltiplos passos|autonom/i);
    expect(s).not.toContain("4 áreas");
  });
});
