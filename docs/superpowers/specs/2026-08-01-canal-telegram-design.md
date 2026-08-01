---
title: Canal Telegram (substitui WhatsApp/Evolution API)
date: 2026-08-01
status: approved
---

# Canal Telegram — substitui WhatsApp/Evolution API

## Objetivo

Remover completamente o canal WhatsApp (Evolution API + docker-compose) e substituir por um bot Telegram usando **grammY** — a mesma biblioteca que OpenClaw usa internamente. O bot responde mensagens diretas no Telegram com o agente Bling.

## Por que grammY

- TypeScript-first (tipos completos, zero casting)
- Webhook via Express com uma linha (`webhookCallback(bot, "express")`)
- `bot.api.sendMessage()` / `ctx.reply()` — sem cliente HTTP manual
- Nenhum servidor extra: a Telegram Bot API é cloud (sem Docker, sem Postgres)
- Gratuito, sem limite de mensagens

## Arquitetura

```
Usuário (Telegram)
  └─ mensagem
       └─ Telegram Bot API (cloud)
            └─ POST /api/telegram/webhook  (HTTPS obrigatório)
                 └─ Express → criarWebhookTelegram()
                      ├─ parseia ctx.message.text
                      ├─ auth por senha (1ª mensagem)
                      ├─ runAgent({ mensagens: sessao.mensagens })
                      └─ ctx.reply(resposta)
```

## Comparativo com canal removido

| | WhatsApp (removido) | Telegram (novo) |
|---|---|---|
| Servidor extra | Evolution API (Docker) | Nenhum |
| Banco de dados | Postgres (Docker) | Nenhum |
| Identificador | número de telefone | `String(ctx.chat.id)` |
| Envio | `evolution.sendText()` | `ctx.reply()` |
| Webhook | `POST /api/whatsapp/webhook` | `POST /api/telegram/webhook` |
| Autenticação | senha na 1ª msg | idêntica |
| Sessões | `SessionStore` (memória) | idêntica (mesmo módulo) |
| Registro webhook | manual no manager | `bot.api.setWebhook(url)` no startup |

## Estrutura de arquivos

### Removidos
```
src/whatsapp/           ← pasta inteira deletada
docker-compose.yml      ← deletado
tests/whatsapp*.test.ts ← não há (whatsapp não tinha testes unitários isolados)
```

### Adicionados
```
src/telegram/
  ├─ webhook.ts         ← bot grammY + handler + criarWebhookTelegram()
  ├─ auth.ts            ← re-exporta decidirAuth de whatsapp/auth (sem mudança de lógica)
  └─ sessions.ts        ← re-exporta criarSessions e tipos (sem mudança de lógica)
```

## Implementação — módulos

### `src/telegram/sessions.ts`
Copia o conteúdo de `src/whatsapp/sessions.ts` integralmente — sem mudança de lógica, só de localização.

### `src/telegram/auth.ts`
Copia o conteúdo de `src/whatsapp/auth.ts` integralmente — sem mudança de lógica, só de localização.

### `src/telegram/webhook.ts`

```typescript
import { Bot, webhookCallback } from "grammy";
import type { RequestHandler } from "express";
import { decidirAuth } from "./auth";
import type { SessionStore } from "./sessions";
import type { Mensagem } from "../agent/agentLoop";

export interface WebhookDeps {
  token: string;
  appUrl: string;   // ex.: "https://agentebling.canastrainteligencia.com"
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

    // autenticado → roda o agente
    deps.sessions.tocar(id);
    sessao.mensagens.push({ role: "user", content: texto });

    try {
      const { texto: resposta } = await deps.runAgent({ mensagens: sessao.mensagens });
      sessao.mensagens.push({ role: "assistant", content: resposta });
      // Telegram limita mensagens a 4096 caracteres
      const truncada = resposta.length > 4000
        ? resposta.slice(0, 4000) + "\n\n_(resposta truncada)_"
        : resposta;
      await ctx.reply(truncada, { parse_mode: "Markdown" });
    } catch (e) {
      console.error("[telegram] erro no agente:", e);
      await ctx.reply("Erro ao processar. Tente novamente.");
    }
  });

  // Registra webhook no Telegram ao iniciar (idempotente)
  const webhookUrl = `${deps.appUrl}/api/telegram/webhook`;
  bot.api.setWebhook(webhookUrl).then(() =>
    console.log(`[telegram] webhook registrado: ${webhookUrl}`)
  ).catch((e) => console.error("[telegram] erro ao registrar webhook:", e));

  return webhookCallback(bot, "express");
}
```

## Mudanças em arquivos existentes

### `src/config.ts`
- Remover bloco `whatsapp` de `AppConfig` e de `loadConfig()`
- Adicionar bloco `telegram`:
  ```typescript
  telegram: {
    habilitado: boolean;   // true se TELEGRAM_BOT_TOKEN e TELEGRAM_ACCESS_PASSWORD presentes
    token: string;
    accessPassword: string;
    sessionTimeoutMin: number;
    appUrl: string;        // APP_URL env var
  };
  ```

### `src/bootstrap.ts`
- Remover imports de `criarEvolutionClient`, `criarWebhookWhatsApp`, `criarSessions` (whatsapp)
- Adicionar import de `criarWebhookTelegram`, `criarSessions` (telegram)
- Trocar bloco whatsapp por bloco telegram análogo

### `src/server.ts`
- Renomear parâmetro `whatsappWebhook` → `telegramWebhook` em `CriarAppDeps`
- Trocar rota `POST /api/whatsapp/webhook` → `POST /api/telegram/webhook`

### `.env.example`
- Remover vars `EVOLUTION_*` e `WHATSAPP_*`
- Adicionar:
  ```
  TELEGRAM_BOT_TOKEN=       # token do BotFather
  TELEGRAM_ACCESS_PASSWORD= # senha exigida na 1ª mensagem
  WHATSAPP_SESSION_TIMEOUT_MIN=30  # reutilizar para Telegram
  APP_URL=https://agentebling.canastrainteligencia.com
  ```

### `README.md`
- Seção "Canal WhatsApp" → "Canal Telegram"
- Instruções: BotFather → token → preencher `.env` → `npm start`
- Remover instruções do docker-compose

## Testes

### Removidos
Não há testes unitários para o canal WhatsApp no repo (os testes existentes cobrem `csv`, `telefoneMeta`, `ultimasCompras`).

### Adicionados
`tests/telegramWebhook.test.ts` — testa `criarWebhookTelegram` com bot mockado:
- Mensagem sem autenticação → pede senha
- Mensagem com senha correta → libera sessão
- Mensagem autenticada → chama `runAgent`, retorna resposta
- Comando "sair" → limpa sessão

## Variáveis de ambiente novas / removidas

| Variável | Status | Descrição |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | nova | token do BotFather |
| `TELEGRAM_ACCESS_PASSWORD` | nova | senha de acesso (1ª msg) |
| `APP_URL` | nova | URL pública (para registrar webhook) |
| `WHATSAPP_SESSION_TIMEOUT_MIN` | renomeada → `SESSION_TIMEOUT_MIN` | ou mantém nome, aplicado ao Telegram |
| `EVOLUTION_API_URL` | removida | |
| `EVOLUTION_API_KEY` | removida | |
| `EVOLUTION_INSTANCE` | removida | |
| `WHATSAPP_ACCESS_PASSWORD` | removida | |

## Setup do bot (uma única vez)

1. No Telegram, fale com **@BotFather** → `/newbot` → copie o token
2. Configure `.env`: `TELEGRAM_BOT_TOKEN=<token>`, `TELEGRAM_ACCESS_PASSWORD=<senha>`, `APP_URL=https://agentebling.canastrainteligencia.com`
3. Suba o backend — o webhook é registrado automaticamente no startup
4. Envie uma mensagem ao bot → ele pede a senha → você envia → libera

## Fora do escopo

- Streaming de resposta (Telegram não suporta; resposta é enviada completa — igual ao WhatsApp)
- Mensagens de mídia (fotos, áudios) — ignoradas silenciosamente pelo handler
- Grupos (bot só responde DMs)
- Inline keyboards / botões interativos
