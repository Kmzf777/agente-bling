import "dotenv/config";
import { loadConfig } from "./config";
import { TokenManager } from "./bling/tokenManager";
import { BlingClient } from "./bling/blingClient";
import { runAgent } from "./agent/agentLoop";
import { criarModelo } from "./agent/provider";
import { montarSystemPrompt } from "./agent/systemPrompt";
import { ehComplexa } from "./agent/router";
import { criarApp } from "./server";
import { criarSessions } from "./whatsapp/sessions";
import { criarEvolutionClient } from "./whatsapp/evolutionClient";
import { criarWebhookWhatsApp } from "./whatsapp/webhook";

export function iniciar() {
  const cfg = loadConfig();
  const modelComplexo = criarModelo(cfg); // Sonnet — análise/recomendação
  const modelSimples = criarModelo(cfg, cfg.agentModelSimples); // Haiku — consulta direta (~3x barato)
  const tokenManager = new TokenManager({
    clientId: cfg.blingClientId, clientSecret: cfg.blingClientSecret, tokenFile: ".bling-tokens.json",
  });
  const blingClient = new BlingClient({ tokenManager });
  const deps = { client: blingClient, situacoesFaturado: cfg.blingSituacaoFaturadoIds, producaoContatoId: cfg.producaoContatoId };

  // Roteia por complexidade da pergunta: consulta simples → Haiku; análise → Sonnet.
  const rotear = (mensagens: any[]) =>
    ehComplexa(mensagens)
      ? { model: modelComplexo, modeloId: cfg.agentModel }
      : { model: modelSimples, modeloId: cfg.agentModelSimples };

  // Canal WhatsApp: só liga se as envs estiverem presentes (cfg.whatsapp.habilitado).
  const whatsappWebhook = cfg.whatsapp.habilitado
    ? criarWebhookWhatsApp({
        runAgent: ({ mensagens }) => {
          const r = rotear(mensagens as any);
          return runAgent({
            model: r.model, modeloId: r.modeloId, systemPrompt: montarSystemPrompt(),
            mensagens: mensagens as any, deps, maxSteps: cfg.agentMaxSteps, usdBrl: cfg.usdBrl,
          });
        },
        evolution: criarEvolutionClient({
          url: cfg.whatsapp.apiUrl, apiKey: cfg.whatsapp.apiKey, instance: cfg.whatsapp.instance,
        }),
        sessions: criarSessions(cfg.whatsapp.sessionTimeoutMin),
        senha: cfg.whatsapp.accessPassword,
      })
    : undefined;
  if (whatsappWebhook) console.log("[whatsapp] canal habilitado");

  const app = criarApp(cfg, {
    runAgent: ({ mensagens }) => {
      const r = rotear(mensagens as any);
      return runAgent({
        model: r.model, modeloId: r.modeloId, systemPrompt: montarSystemPrompt(),
        mensagens: mensagens as any, deps, maxSteps: cfg.agentMaxSteps, usdBrl: cfg.usdBrl,
      });
    },
    runAgentStream: ({ mensagens, onEvent }) => {
      const r = rotear(mensagens as any);
      return runAgent({
        model: r.model, modeloId: r.modeloId, systemPrompt: montarSystemPrompt(),
        mensagens: mensagens as any, deps, maxSteps: cfg.agentMaxSteps, usdBrl: cfg.usdBrl, onEvent,
      });
    },
    whatsappWebhook,
  });
  app.listen(cfg.port, () => console.log(`Agente Bling Café rodando em http://localhost:${cfg.port}`));
}

// Ponto de entrada: `tsx src/bootstrap.ts` (via npm start/dev) sobe o servidor.
iniciar();
