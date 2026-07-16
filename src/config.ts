export interface AppConfig {
  openaiApiKey: string;
  openaiModel: string;
  blingClientId: string;
  blingClientSecret: string;
  blingRedirectUri: string;
  blingSituacaoFaturadoIds: number[];
  producaoContatoId: string;
  appPassword: string;
  sessionSecret: string;
  corsOrigin: string;
  port: number;
  agentProvider: "anthropic";
  agentModel: string;
  agentModelSimples: string;
  anthropicApiKey: string;
  agentMaxSteps: number;
  usdBrl: number;
}

const REQUIRED = ["ANTHROPIC_API_KEY", "BLING_CLIENT_ID", "BLING_CLIENT_SECRET", "APP_PASSWORD", "SESSION_SECRET"] as const;

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): AppConfig {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Variáveis de ambiente ausentes: ${missing.join(", ")}`);
  return {
    openaiApiKey: env.OPENAI_API_KEY || "",
    openaiModel: env.OPENAI_MODEL || "gpt-4.1-mini",
    blingClientId: env.BLING_CLIENT_ID!,
    blingClientSecret: env.BLING_CLIENT_SECRET!,
    blingRedirectUri: env.BLING_REDIRECT_URI || "http://localhost:3000/api/bling/callback",
    blingSituacaoFaturadoIds: (env.BLING_SITUACAO_FATURADO_IDS || "")
      .split(",").map((s) => s.trim()).filter(Boolean).map(Number),
    producaoContatoId: env.PRODUCAO_CONTATO_ID || "11424392310",
    appPassword: env.APP_PASSWORD!,
    sessionSecret: env.SESSION_SECRET!,
    corsOrigin: env.CORS_ORIGIN || "*",
    port: Number(env.PORT || 3000),
    agentProvider: "anthropic",
    agentModel: env.AGENT_MODEL || "claude-sonnet-4-6",
    agentModelSimples: env.AGENT_MODEL_SIMPLES || "claude-haiku-4-5",
    anthropicApiKey: env.ANTHROPIC_API_KEY || "",
    agentMaxSteps: Number(env.AGENT_MAX_STEPS || 20),
    usdBrl: Number(env.USD_BRL || 5.6),
  };
}
