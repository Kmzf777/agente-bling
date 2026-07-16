import { describe, it, expect } from "vitest";
import { calcularCusto, precosPorModelo } from "../src/agent/custo";

describe("calcularCusto (Sonnet)", () => {
  it("1M tokens de entrada = US$ 3", () => {
    const r = calcularCusto({ inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(r.usd).toBe(3);
  });

  it("1M tokens de saída = US$ 15", () => {
    const r = calcularCusto({ inputTokens: 0, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(r.usd).toBe(15);
  });

  it("soma todas as faixas (entrada/saída/cache-read/cache-write)", () => {
    const r = calcularCusto({ inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 1000, cacheWriteTokens: 1000 });
    // (1000*3 + 1000*15 + 1000*0.30 + 1000*3.75) / 1e6 = 22050/1e6
    expect(r.usd).toBeCloseTo(0.02205, 6);
    expect(r.cacheReadTokens).toBe(1000);
    expect(r.cacheWriteTokens).toBe(1000);
  });

  it("usa as tarifas do Haiku quando o modelo é haiku", () => {
    const r = calcularCusto(
      { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      precosPorModelo("claude-haiku-4-5"),
    );
    expect(r.usd).toBe(1); // 1M de entrada no Haiku = US$ 1 (vs US$ 3 no Sonnet)
  });
});
