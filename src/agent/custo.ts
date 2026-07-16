// Tarifas do Claude Sonnet 4.6 em USD por 1M de tokens.
// (Se trocar de modelo, ajuste aqui.)
export const PRECOS_SONNET = {
  entrada: 3, // input
  saida: 15, // output
  cacheRead: 0.3, // leitura de cache (~0,1x da entrada)
  cacheWrite: 3.75, // escrita de cache (1,25x da entrada)
} as const;

export interface TokensUso {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface Custo extends TokensUso {
  usd: number;
}

/** Custo em USD de uma resposta, a partir dos tokens consumidos (entrada/saída/cache). */
export function calcularCusto(t: TokensUso): Custo {
  const usd =
    (t.inputTokens * PRECOS_SONNET.entrada +
      t.outputTokens * PRECOS_SONNET.saida +
      t.cacheReadTokens * PRECOS_SONNET.cacheRead +
      t.cacheWriteTokens * PRECOS_SONNET.cacheWrite) /
    1_000_000;
  return {
    usd: Math.round(usd * 1e6) / 1e6, // custos são frações de centavo → 6 casas
    inputTokens: t.inputTokens,
    outputTokens: t.outputTokens,
    cacheReadTokens: t.cacheReadTokens,
    cacheWriteTokens: t.cacheWriteTokens,
  };
}
