// Tarifas em USD por 1M de tokens, por família de modelo (Claude 4.x).
export const PRECOS = {
  sonnet: { entrada: 3, saida: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  haiku: { entrada: 1, saida: 5, cacheRead: 0.1, cacheWrite: 1.25 },
} as const;

export interface Precos { entrada: number; saida: number; cacheRead: number; cacheWrite: number; }

/** Escolhe a tabela de preços pela família do modelo (haiku vs sonnet). */
export function precosPorModelo(modelId?: string): Precos {
  return /haiku/i.test(modelId ?? "") ? PRECOS.haiku : PRECOS.sonnet;
}

export interface TokensUso {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface Custo extends TokensUso {
  usd: number;
}

/** Custo em USD de uma resposta, a partir dos tokens consumidos e da tabela do modelo. */
export function calcularCusto(t: TokensUso, precos: Precos = PRECOS.sonnet): Custo {
  const usd =
    (t.inputTokens * precos.entrada +
      t.outputTokens * precos.saida +
      t.cacheReadTokens * precos.cacheRead +
      t.cacheWriteTokens * precos.cacheWrite) /
    1_000_000;
  return {
    usd: Math.round(usd * 1e6) / 1e6, // custos são frações de centavo → 6 casas
    inputTokens: t.inputTokens,
    outputTokens: t.outputTokens,
    cacheReadTokens: t.cacheReadTokens,
    cacheWriteTokens: t.cacheWriteTokens,
  };
}
