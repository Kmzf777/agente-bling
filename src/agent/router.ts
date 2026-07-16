import type { Mensagem } from "./agentLoop";

// Sinais de análise/recomendação/estratégia → exigem o modelo forte (Sonnet).
// Consultas diretas de dado ("quanto vendi", "estoque baixo") caem no Haiku, ~3× mais barato.
const SINAIS_COMPLEXO =
  /recomend|conselh|analis|an[áa]lise|estrat[ée]g|por ?qu[eê]|porqu[eê]|deveria|vale a pena|compar|tend[êe]ncia|otimiz|melhor|sa[úu]d[áa]vel|cen[áa]rio|explic|entend|avali|projet|previs|plano de|diagn[óo]stic|cruz|o que fa[çz]|deveria|sugere|opini/i;

/** Decide se a pergunta precisa do modelo forte (Sonnet). Caso contrário, o Haiku dá conta. */
export function ehComplexa(mensagens: Mensagem[]): boolean {
  const ultima = [...mensagens].reverse().find((m) => m.role === "user");
  const texto = String(ultima?.content ?? "");
  if (texto.length > 220) return true; // perguntas longas tendem a ser nuançadas
  return SINAIS_COMPLEXO.test(texto);
}
