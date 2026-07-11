export interface AppConfig {
  anthropicApiKey: string;
  anthropicModel: string;
  blingClientId: string;
  blingClientSecret: string;
  blingRedirectUri: string;
  blingSituacaoFaturadoIds: number[];
  appPassword: string;
  sessionSecret: string;
  port: number;
}

const REQUIRED = ["ANTHROPIC_API_KEY", "BLING_CLIENT_ID", "BLING_CLIENT_SECRET", "APP_PASSWORD", "SESSION_SECRET"] as const;

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): AppConfig {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Variáveis de ambiente ausentes: ${missing.join(", ")}`);
  return {
    anthropicApiKey: env.ANTHROPIC_API_KEY!,
    anthropicModel: env.ANTHROPIC_MODEL || "claude-haiku-4-5",
    blingClientId: env.BLING_CLIENT_ID!,
    blingClientSecret: env.BLING_CLIENT_SECRET!,
    blingRedirectUri: env.BLING_REDIRECT_URI || "http://localhost:3000/api/bling/callback",
    blingSituacaoFaturadoIds: (env.BLING_SITUACAO_FATURADO_IDS || "")
      .split(",").map((s) => s.trim()).filter(Boolean).map(Number),
    appPassword: env.APP_PASSWORD!,
    sessionSecret: env.SESSION_SECRET!,
    port: Number(env.PORT || 3000),
  };
}
