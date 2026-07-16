import { describe, it, expect } from "vitest";
import { ehComplexa } from "../src/agent/router";

const u = (content: string) => [{ role: "user" as const, content }];

describe("ehComplexa (roteamento Haiku/Sonnet)", () => {
  it("consulta simples de dado → Haiku (não complexa)", () => {
    expect(ehComplexa(u("Quais produtos estão com estoque baixo?"))).toBe(false);
    expect(ehComplexa(u("Quanto vendi hoje?"))).toBe(false);
    expect(ehComplexa(u("Total de contas a pagar do mês"))).toBe(false);
  });

  it("pedido de análise/recomendação → Sonnet (complexa)", () => {
    expect(ehComplexa(u("O que você recomenda para melhorar a margem?"))).toBe(true);
    expect(ehComplexa(u("Analise a tendência das vendas e compare com o ano passado"))).toBe(true);
    expect(ehComplexa(u("Por que meu faturamento caiu?"))).toBe(true);
  });

  it("pergunta longa → Sonnet", () => {
    expect(ehComplexa(u("x".repeat(250)))).toBe(true);
  });

  it("usa a última mensagem do usuário", () => {
    const conv = [
      { role: "user" as const, content: "oi" },
      { role: "assistant" as const, content: "olá" },
      { role: "user" as const, content: "quanto vendi?" },
    ];
    expect(ehComplexa(conv)).toBe(false);
  });
});
