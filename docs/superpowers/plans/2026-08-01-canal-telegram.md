# Canal Telegram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o canal WhatsApp/Evolution API por um bot Telegram usando grammY, removendo toda a dependência de Docker/Postgres para mensagens.

**Architecture:** Canal Telegram segue o mesmo padrão do WhatsApp: webhook Express recebe updates do Telegram, auth por senha na 1ª mensagem, sessão em memória, `runAgent` retorna a resposta. O bot registra o webhook no Telegram automaticamente ao subir.

**Tech Stack:** grammY, Express, vitest para testes, TypeScript.

**Execute na ordem:** as tasks 7-9 (config/bootstrap/server) devem ser feitas juntas antes do typecheck, pois criam erros de tipo transitórios.

---

### Task 1: Instalar grammy

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Instalar a dependência**

```bash
npm install grammy
```

- [ ] **Step 2: Verificar que os testes existentes continuam passando**

```bash
npm test
```

Esperado: todos os testes passam (csv, telefoneMeta, ultimasCompras).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(telegram): adiciona dependência grammy"
```

---

### Task 2: Criar src/telegram/sessions.ts

**Files:**
- Create: `src/telegram/sessions.ts`

- [ ] **Step 1: Copiar sessions.ts do módulo whatsapp**

Criar `src/telegram/sessions.ts` com exatamente este conteúdo (cópia direta de `src/whatsapp/sessions.ts`):

```typescript
import type { Mensagem } from "../agent/agentLoop";

export interface Sessao {
  autenticado: boolean;
  mensagens: Mensagem[];
  expiraEm: number; // epoch ms
}

export interface SessionStore {
  /** Retorna a sessão viva do número, ou cria uma nova (resetando se expirou). */
  obter(numero: string): Sessao;
  /** Renova a expiração do número (agora + timeout). */
  tocar(numero: string): void;
  /** Remove a sessão (comando de reset). */
  limpar(numero: string): void;
}

export function criarSessions(timeoutMin: number, agora: () => number = Date.now): SessionStore {
  const mapa = new Map<string, Sessao>();
  const ttl = timeoutMin * 60 * 1000;
  const nova = (): Sessao => ({ autenticado: false, mensagens: [], expiraEm: agora() + ttl });
  return {
    obter(numero) {
      const s = mapa.get(numero);
      if (!s || agora() > s.expiraEm) {
        const n = nova();
        mapa.set(numero, n);
        return n;
      }
      return s;
    },
    tocar(numero) {
      const s = mapa.get(numero);
      if (s) s.expiraEm = agora() + ttl;
    },
    limpar(numero) {
      mapa.delete(numero);
    },
  };
}
```

- [ ] **Step 2: Verificar compilação**

```bash
npm run typecheck
```

Esperado: sem erros relacionados a `src/telegram/sessions.ts`.

---

### Task 3: Criar src/telegram/auth.ts

**Files:**
- Create: `src/telegram/auth.ts`

- [ ] **Step 1: Copiar auth.ts do módulo whatsapp**

Criar `src/telegram/auth.ts` com exatamente este conteúdo (cópia direta de `src/whatsapp/auth.ts`):

```typescript
export type DecisaoAuth = "seguir" | "autenticar" | "pedir_senha";

export function decidirAuth(
  sessao: { autenticado: boolean },
  texto: string,
  senha: string,
): DecisaoAuth {
  if (sessao.autenticado) return "seguir";
  if (texto.trim() === senha) return "autenticar";
  return "pedir_senha";
}
```

---

### Task 4: Escrever testes falhos para criarWebhookTelegram

**Files:**
- Create: `tests/telegramWebhook.test.ts`

- [ ] **Step 1: Criar o arquivo de testes**

Criar `tests/telegramWebhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { criarSessions } from "../src/telegram/sessions";

// --- mocks (vi.mock é hoisted pelo vitest, roda antes dos imports) ---
const mockReply = vi.fn();
const mockSetWebhook = vi.fn();
let capturedTextHandler: ((ctx: any) => Promise<void>) | undefined;

vi.mock("grammy", () => ({
  Bot: vi.fn().mockImplementation(() => ({
    on: vi.fn((event: string, handler: (ctx: any) => Promise<void>) => {
      if (event === "message:text") capturedTextHandler = handler;
    }),
    api: { setWebhook: mockSetWebhook },
  })),
  webhookCallback: vi.fn().mockReturnValue(vi.fn()),
}));

import { criarWebhookTelegram } from "../src/telegram/webhook";

// --- helper factories ---
const makeCtx = (texto: string, chatId = 42) => ({
  chat: { id: chatId },
  message: { text: texto },
  reply: mockReply,
});

function criarDeps() {
  return {
    token: "tok",
    appUrl: "https://example.com",
    runAgent: vi.fn().mockResolvedValue({ texto: "Você vendeu R$ 1.000 hoje." }),
    sessions: criarSessions(30),
    senha: "abc123",
  };
}

describe("criarWebhookTelegram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReply.mockResolvedValue(undefined);
    mockSetWebhook.mockResolvedValue(undefined);
    capturedTextHandler = undefined;
  });

  it("pede senha quando não autenticado", async () => {
    criarWebhookTelegram(criarDeps());
    await capturedTextHandler!(makeCtx("olá"));
    expect(mockReply).toHaveBeenCalledWith("Olá! Envie a senha de acesso para começar.");
  });

  it("não chama runAgent antes da autenticação", async () => {
    const deps = criarDeps();
    criarWebhookTelegram(deps);
    await capturedTextHandler!(makeCtx("pergunta"));
    expect(deps.runAgent).not.toHaveBeenCalled();
  });

  it("autentica quando senha correta é enviada", async () => {
    criarWebhookTelegram(criarDeps());
    await capturedTextHandler!(makeCtx("abc123"));
    expect(mockReply).toHaveBeenCalledWith(expect.stringContaining("Acesso liberado"));
  });

  it("chama runAgent e responde após autenticação", async () => {
    const deps = criarDeps();
    criarWebhookTelegram(deps);
    await capturedTextHandler!(makeCtx("abc123")); // autenticar
    mockReply.mockClear();
    await capturedTextHandler!(makeCtx("quanto vendi hoje?"));
    expect(deps.runAgent).toHaveBeenCalledOnce();
    expect(mockReply).toHaveBeenCalledWith("Você vendeu R$ 1.000 hoje.");
  });

  it("reseta sessão no comando sair e pede senha na próxima msg", async () => {
    const deps = criarDeps();
    criarWebhookTelegram(deps);
    await capturedTextHandler!(makeCtx("abc123")); // autenticar
    await capturedTextHandler!(makeCtx("sair"));
    expect(mockReply).toHaveBeenLastCalledWith(
      "Sessão reiniciada. Envie a senha para continuar."
    );
    mockReply.mockClear();
    await capturedTextHandler!(makeCtx("uma pergunta"));
    expect(mockReply).toHaveBeenCalledWith("Olá! Envie a senha de acesso para começar.");
  });

  it("registra webhook no Telegram ao inicializar", () => {
    criarWebhookTelegram(criarDeps());
    expect(mockSetWebhook).toHaveBeenCalledWith(
      "https://example.com/api/telegram/webhook"
    );
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falham**

```bash
npm test tests/telegramWebhook.test.ts
```

Esperado: FAIL com `Cannot find module '../src/telegram/webhook'`.

---

### Task 5: Implementar src/telegram/webhook.ts

**Files:**
- Create: `src/telegram/webhook.ts`

- [ ] **Step 1: Criar o handler do canal Telegram**

Criar `src/telegram/webhook.ts`:

```typescript
import { Bot, webhookCallback } from "grammy";
import type { RequestHandler } from "express";
import { decidirAuth } from "./auth";
import type { SessionStore } from "./sessions";
import type { Mensagem } from "../agent/agentLoop";

export interface WebhookDeps {
  token: string;
  appUrl: string;
  runAgent: (args: { mensagens: Mensagem[] }) => Promise<{ texto: string }>;
  sessions: SessionStore;
  senha: string;
}

const RESET = new Set(["sair", "recomeçar", "recomecar", "reset"]);

export function criarWebhookTelegram(deps: WebhookDeps): RequestHandler {
  const bot = new Bot(deps.token);

  bot.on("message:text", async (ctx) => {
    const id = String(ctx.chat.id);
    const texto = ctx.message.text.trim();

    if (RESET.has(texto.toLowerCase())) {
      deps.sessions.limpar(id);
      await ctx.reply("Sessão reiniciada. Envie a senha para continuar.");
      return;
    }

    const sessao = deps.sessions.obter(id);
    const decisao = decidirAuth(sessao, texto, deps.senha);

    if (decisao === "pedir_senha") {
      await ctx.reply("Olá! Envie a senha de acesso para começar.");
      return;
    }

    if (decisao === "autenticar") {
      sessao.autenticado = true;
      deps.sessions.tocar(id);
      await ctx.reply("Acesso liberado! Pode perguntar sobre vendas, estoque, faturamento...");
      return;
    }

    deps.sessions.tocar(id);
    sessao.mensagens.push({ role: "user", content: texto });

    try {
      const { texto: resposta } = await deps.runAgent({ mensagens: sessao.mensagens });
      sessao.mensagens.push({ role: "assistant", content: resposta });
      const truncada =
        resposta.length > 4000 ? resposta.slice(0, 4000) + "\n\n_(resposta truncada)_" : resposta;
      await ctx.reply(truncada);
    } catch (e) {
      console.error("[telegram] erro no agente:", e);
      await ctx.reply("Erro ao processar. Tente novamente.");
    }
  });

  const webhookUrl = `${deps.appUrl}/api/telegram/webhook`;
  bot.api
    .setWebhook(webhookUrl)
    .then(() => console.log(`[telegram] webhook registrado: ${webhookUrl}`))
    .catch((e: unknown) => console.error("[telegram] erro ao registrar webhook:", e));

  return webhookCallback(bot, "express");
}
```

- [ ] **Step 2: Rodar os testes**

```bash
npm test tests/telegramWebhook.test.ts
```

Esperado: todos os 6 testes PASS.

- [ ] **Step 3: Rodar toda a suíte**

```bash
npm test
```

Esperado: todos os testes passam.

- [ ] **Step 4: Commit**

```bash
git add src/telegram/ tests/telegramWebhook.test.ts
git commit -m "feat(telegram): canal Telegram via grammY (auth, sessão, runAgent)"
```

---

### Task 6: Atualizar src/config.ts

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Substituir bloco whatsapp por telegram em AppConfig e loadConfig**

Editar `src/config.ts`. Substituir a interface `AppConfig` inteira e a função `loadConfig` inteira pelo conteúdo abaixo:

```typescript
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
  telegram: {
    habilitado: boolean;
    token: string;
    accessPassword: string;
    sessionTimeoutMin: number;
    appUrl: string;
  };
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
    telegram: {
      habilitado: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ACCESS_PASSWORD),
      token: env.TELEGRAM_BOT_TOKEN || "",
      accessPassword: env.TELEGRAM_ACCESS_PASSWORD || "",
      sessionTimeoutMin: Number(env.SESSION_TIMEOUT_MIN || 30),
      appUrl: env.APP_URL || "http://localhost:3000",
    },
  };
}
```

---

### Task 7: Atualizar src/bootstrap.ts

**Files:**
- Modify: `src/bootstrap.ts`

- [ ] **Step 1: Substituir canal whatsapp pelo canal telegram**

Substituir o conteúdo completo de `src/bootstrap.ts`:

```typescript
import "dotenv/config";
import { loadConfig } from "./config";
import { TokenManager } from "./bling/tokenManager";
import { BlingClient } from "./bling/blingClient";
import { runAgent } from "./agent/agentLoop";
import { criarModelo } from "./agent/provider";
import { montarSystemPrompt } from "./agent/systemPrompt";
import { ehComplexa } from "./agent/router";
import { criarApp } from "./server";
import { criarSessions } from "./telegram/sessions";
import { criarWebhookTelegram } from "./telegram/webhook";

export function iniciar() {
  const cfg = loadConfig();
  const modelComplexo = criarModelo(cfg);
  const modelSimples = criarModelo(cfg, cfg.agentModelSimples);
  const tokenManager = new TokenManager({
    clientId: cfg.blingClientId, clientSecret: cfg.blingClientSecret, tokenFile: ".bling-tokens.json",
  });
  const blingClient = new BlingClient({ tokenManager });
  const deps = { client: blingClient, situacoesFaturado: cfg.blingSituacaoFaturadoIds, producaoContatoId: cfg.producaoContatoId };

  const rotear = (mensagens: any[]) =>
    ehComplexa(mensagens)
      ? { model: modelComplexo, modeloId: cfg.agentModel }
      : { model: modelSimples, modeloId: cfg.agentModelSimples };

  const telegramWebhook = cfg.telegram.habilitado
    ? criarWebhookTelegram({
        token: cfg.telegram.token,
        appUrl: cfg.telegram.appUrl,
        runAgent: ({ mensagens }) => {
          const r = rotear(mensagens as any);
          return runAgent({
            model: r.model, modeloId: r.modeloId, systemPrompt: montarSystemPrompt(),
            mensagens: mensagens as any, deps, maxSteps: cfg.agentMaxSteps, usdBrl: cfg.usdBrl,
          });
        },
        sessions: criarSessions(cfg.telegram.sessionTimeoutMin),
        senha: cfg.telegram.accessPassword,
      })
    : undefined;
  if (telegramWebhook) console.log("[telegram] canal habilitado");

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
    telegramWebhook,
  });
  app.listen(cfg.port, () => console.log(`Agente Bling Café rodando em http://localhost:${cfg.port}`));
}

iniciar();
```

---

### Task 8: Atualizar src/server.ts

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Renomear whatsappWebhook → telegramWebhook e trocar a rota**

Em `src/server.ts`, substituir a interface `ServerDeps` e o bloco de registro da rota:

Substituir:
```typescript
export interface ServerDeps {
  runAgent: (args: { mensagens: unknown[] }) => Promise<{ texto: string }>;
  runAgentStream?: (args: { mensagens: unknown[]; onEvent: (ev: unknown) => void }) => Promise<{ texto: string }>;
  whatsappWebhook?: import("express").RequestHandler;
}
```

Por:
```typescript
export interface ServerDeps {
  runAgent: (args: { mensagens: unknown[] }) => Promise<{ texto: string }>;
  runAgentStream?: (args: { mensagens: unknown[]; onEvent: (ev: unknown) => void }) => Promise<{ texto: string }>;
  telegramWebhook?: import("express").RequestHandler;
}
```

Substituir:
```typescript
  if (deps.whatsappWebhook) {
    app.post("/api/whatsapp/webhook", deps.whatsappWebhook);
  }
```

Por:
```typescript
  if (deps.telegramWebhook) {
    app.post("/api/telegram/webhook", deps.telegramWebhook);
  }
```

- [ ] **Step 2: Verificar typecheck após tasks 6-7-8**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 3: Rodar testes**

```bash
npm test
```

Esperado: todos os testes passam.

- [ ] **Step 4: Commit das alterações de integração**

```bash
git add src/config.ts src/bootstrap.ts src/server.ts
git commit -m "feat(telegram): integra canal Telegram no bootstrap e server (remove WhatsApp)"
```

---

### Task 9: Remover src/whatsapp/ e docker-compose.yml

**Files:**
- Delete: `src/whatsapp/` (pasta inteira)
- Delete: `docker-compose.yml`

- [ ] **Step 1: Deletar pasta whatsapp**

```bash
rm -rf src/whatsapp
```

No Windows PowerShell:
```powershell
Remove-Item -Recurse -Force src/whatsapp
```

- [ ] **Step 2: Deletar docker-compose.yml**

```bash
rm docker-compose.yml
```

No Windows PowerShell:
```powershell
Remove-Item docker-compose.yml
```

- [ ] **Step 3: Verificar que não há imports quebrados**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 4: Rodar testes**

```bash
npm test
```

Esperado: todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove canal WhatsApp/Evolution API e docker-compose"
```

---

### Task 10: Atualizar .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Substituir variáveis de WhatsApp/Evolution por Telegram**

Substituir o bloco `--- Canal WhatsApp ---` no final do `.env.example` por:

```
# --- Canal Telegram (bot) --- opcional. Deixe vazio para desligar o canal. ---
TELEGRAM_BOT_TOKEN=          # token gerado pelo @BotFather no Telegram
TELEGRAM_ACCESS_PASSWORD=    # senha exigida na 1ª mensagem de cada usuário
SESSION_TIMEOUT_MIN=30       # minutos de inatividade até expirar a sessão
APP_URL=https://agentebling.canastrainteligencia.com  # URL pública do backend (para registrar webhook)
```

Também atualizar a linha `BLING_REDIRECT_URI` para documentar o valor de produção:

```
BLING_REDIRECT_URI=http://localhost:3000/api/bling/callback
# Em produção: BLING_REDIRECT_URI=https://agentebling.canastrainteligencia.com/api/bling/callback
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: atualiza .env.example para canal Telegram (remove Evolution)"
```

---

### Task 11: Atualizar README.md — seção Canal

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Substituir seção "Canal WhatsApp" por "Canal Telegram"**

Localizar a seção `## Canal WhatsApp (Evolution API, self-host)` no README e substituir por:

```markdown
## Canal Telegram

O agente também atende pelo **Telegram**, via bot usando [grammY](https://grammy.dev/).
Não requer Docker nem servidor extra — apenas um token do BotFather.

### Setup (uma única vez)

1. No Telegram, fale com **@BotFather** → `/newbot` → escolha um nome e username → copie o **token**.
2. Preencha o `.env`:
   ```
   TELEGRAM_BOT_TOKEN=<token copiado>
   TELEGRAM_ACCESS_PASSWORD=<senha que você quiser>
   APP_URL=https://agentebling.canastrainteligencia.com
   ```
3. Suba o backend (`npm start`). O webhook é registrado automaticamente no Telegram.
4. No Telegram, encontre o bot pelo username → envie qualquer mensagem → ele pede a senha.
5. Envie a `TELEGRAM_ACCESS_PASSWORD` → acesso liberado. Pergunte sobre vendas, estoque...

Para reiniciar a sessão, envie **`sair`**.

> **Desenvolvimento local:** o Telegram exige HTTPS para webhooks. Para testar localmente,
> use [ngrok](https://ngrok.com): `ngrok http 3000`, e defina `APP_URL=https://<sua-url>.ngrok-free.app`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: substitui seção Canal WhatsApp por Canal Telegram no README"
```

---

### Task 12: Verificação final e push

- [ ] **Step 1: Rodar toda a suíte de testes**

```bash
npm test
```

Esperado: todos os testes passam (csv, telefoneMeta, ultimasCompras, telegramWebhook).

- [ ] **Step 2: Typecheck final**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 3: Push**

```bash
git push origin main
```
