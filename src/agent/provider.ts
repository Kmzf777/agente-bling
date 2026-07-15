import { createAnthropic } from "@ai-sdk/anthropic";
import type { AppConfig } from "../config";

/**
 * Factory de modelo do agente (provider-agnostic via Vercel AI SDK).
 * Hoje só Anthropic; OpenAI fica como extensão futura (YAGNI).
 */
export function criarModelo(cfg: Pick<AppConfig, "agentProvider" | "agentModel" | "anthropicApiKey">) {
  if (cfg.agentProvider === "anthropic") {
    if (!cfg.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY ausente para provider anthropic");
    const anthropic = createAnthropic({ apiKey: cfg.anthropicApiKey });
    return anthropic(cfg.agentModel);
  }
  throw new Error(`Provider não suportado: ${cfg.agentProvider}`);
}
