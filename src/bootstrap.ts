import "dotenv/config";
import { loadConfig } from "./config";
import { TokenManager } from "./bling/tokenManager";
import { BlingClient } from "./bling/blingClient";
import { runAgent } from "./agent/agentLoop";
import { criarModelo } from "./agent/provider";
import { montarSystemPrompt } from "./agent/systemPrompt";
import { criarApp } from "./server";

export function iniciar() {
  const cfg = loadConfig();
  const model = criarModelo(cfg);
  const tokenManager = new TokenManager({
    clientId: cfg.blingClientId, clientSecret: cfg.blingClientSecret, tokenFile: ".bling-tokens.json",
  });
  const blingClient = new BlingClient({ tokenManager });
  const deps = { client: blingClient, situacoesFaturado: cfg.blingSituacaoFaturadoIds };

  const app = criarApp(cfg, {
    runAgent: ({ mensagens }) => runAgent({
      model, systemPrompt: montarSystemPrompt(), mensagens: mensagens as any,
      deps, maxSteps: cfg.agentMaxSteps,
    }),
    runAgentStream: ({ mensagens, onEvent }) => runAgent({
      model, systemPrompt: montarSystemPrompt(), mensagens: mensagens as any,
      deps, maxSteps: cfg.agentMaxSteps, onEvent,
    }),
  });
  app.listen(cfg.port, () => console.log(`Agente Bling Café rodando em http://localhost:${cfg.port}`));
}

// Ponto de entrada: `tsx src/bootstrap.ts` (via npm start/dev) sobe o servidor.
iniciar();
