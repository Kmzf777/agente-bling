export interface EvolutionConfig {
  url: string;       // ex.: http://localhost:8080
  apiKey: string;    // AUTHENTICATION_API_KEY da Evolution
  instance: string;  // nome da instância
}

export interface EvolutionClient {
  sendText(numero: string, texto: string): Promise<void>;
}

/**
 * Cliente mínimo da Evolution API v2. Só envia texto — é o único verbo que o canal usa.
 * `fetchImpl` é injetável para testes. Falhas são logadas, não propagadas (não derruba o webhook).
 */
export function criarEvolutionClient(cfg: EvolutionConfig, fetchImpl: typeof fetch = fetch): EvolutionClient {
  return {
    async sendText(numero, texto) {
      try {
        const r = await fetchImpl(`${cfg.url}/message/sendText/${cfg.instance}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
          body: JSON.stringify({ number: numero, text: texto }),
        });
        if (!r.ok) console.error(`[whatsapp] sendText ${r.status}: ${await r.text()}`);
      } catch (e) {
        console.error("[whatsapp] sendText falhou:", e);
      }
    },
  };
}
