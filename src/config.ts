export interface AppConfig {
  openaiApiKey: string;
  openaiModel: string;
  blingClientId: string;
  blingClientSecret: string;
  blingRedirectUri: string;
  blingSituacaoFaturadoIds: number[];
  appPassword: string;
  sessionSecret: string;
  corsOrigin: string;
  port: number;
  agentProvider: "anthropic";
  agentModel: string;
  anthropicApiKey: string;
  agentMaxSteps: number;
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
    appPassword: env.APP_PASSWORD!,
    sessionSecret: env.SESSION_SECRET!,
    corsOrigin: env.CORS_ORIGIN || "*",
    port: Number(env.PORT || 3000),
    agentProvider: "anthropic",
    agentModel: env.AGENT_MODEL || "claude-sonnet-4-6",
    anthropicApiKey: env.ANTHROPIC_API_KEY || "",
    agentMaxSteps: Number(env.AGENT_MAX_STEPS || 20),
  };
}
