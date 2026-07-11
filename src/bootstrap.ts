import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "./config";
import { TokenManager } from "./bling/tokenManager";
import { BlingClient } from "./bling/blingClient";
import { runAgent } from "./agent/claudeClient";
import { criarApp } from "./server";

export function iniciar() {
  const cfg = loadConfig();
  const anthropic = new Anthropic({ apiKey: cfg.anthropicApiKey });
  const tokenManager = new TokenManager({
    clientId: cfg.blingClientId, clientSecret: cfg.blingClientSecret, tokenFile: ".bling-tokens.json",
  });
  const blingClient = new BlingClient({ tokenManager });

  const app = criarApp(cfg, {
    runAgent: ({ mensagens }) => runAgent({
      anthropic, model: cfg.anthropicModel, mensagens: mensagens as any,
      deps: { client: blingClient, situacoesFaturado: cfg.blingSituacaoFaturadoIds },
    }),
  });
  app.listen(cfg.port, () => console.log(`Agente Bling Café rodando em http://localhost:${cfg.port}`));
}
