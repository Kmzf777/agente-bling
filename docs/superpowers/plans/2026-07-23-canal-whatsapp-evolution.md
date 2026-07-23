# Canal WhatsApp via Evolution API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um canal WhatsApp ao agente Bling Café, reaproveitando o `runAgent` existente, com Evolution API self-hostada via Docker.

**Architecture:** A Evolution API (Docker, local) recebe mensagens do WhatsApp e as envia por webhook para uma rota nova no backend Express (`POST /api/whatsapp/webhook`). A rota autentica o número por senha (1ª mensagem), mantém histórico em memória por contato (com timeout), chama o mesmo `runAgent({ mensagens })` e responde via API da Evolution (`sendText`). Nada é exposto à internet — ngrok não é necessário.

**Tech Stack:** Node + TypeScript, Express, Vitest, Docker Compose (Evolution API v2 + Postgres), Vercel AI SDK (já existente).

---

## Estrutura de arquivos

- `src/whatsapp/sessions.ts` — store de sessão em memória por número (autenticação + histórico + timeout).
- `src/whatsapp/auth.ts` — decisão de autenticação por senha na 1ª mensagem.
- `src/whatsapp/evolutionClient.ts` — cliente HTTP para a Evolution (`sendText`).
- `src/whatsapp/webhook.ts` — factory da rota Express: parse do payload + orquestração.
- `src/config.ts` — (modificar) novas envs do WhatsApp.
- `src/server.ts` — (modificar) montar a rota do webhook quando habilitado.
- `src/bootstrap.ts` — (modificar) instanciar deps do WhatsApp e passar para `criarApp`.
- `docker-compose.yml` — (criar) Evolution API + Postgres.
- `.env.example`, `README.md` — (modificar) documentar setup.
- `tests/whatsappSessions.test.ts`, `tests/whatsappAuth.test.ts`, `tests/whatsappEvolutionClient.test.ts`, `tests/whatsappWebhook.test.ts` — (criar).

Convenção do projeto: arquivos focados, comentários em PT-BR no estilo do código existente, testes Vitest espelhando `tests/*.test.ts`.

---

## Task 1: Sessões em memória

**Files:**
- Create: `src/whatsapp/sessions.ts`
- Test: `tests/whatsappSessions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/whatsappSessions.test.ts
import { describe, it, expect } from "vitest";
import { criarSessions } from "../src/whatsapp/sessions";

describe("sessions do WhatsApp", () => {
  it("cria sessão nova não autenticada", () => {
    const s = criarSessions(30);
    const sess = s.obter("5531999");
    expect(sess.autenticado).toBe(false);
    expect(sess.mensagens).toEqual([]);
  });

  it("persiste estado entre chamadas do mesmo número", () => {
    const s = criarSessions(30);
    const sess = s.obter("5531999");
    sess.autenticado = true;
    sess.mensagens.push({ role: "user", content: "oi" });
    expect(s.obter("5531999").autenticado).toBe(true);
    expect(s.obter("5531999").mensagens).toHaveLength(1);
  });

  it("expira após o timeout de inatividade e reseta a sessão", () => {
    let t = 1_000_000;
    const s = criarSessions(30, () => t); // timeout 30 min
    const sess = s.obter("5531999");
    sess.autenticado = true;
    s.tocar("5531999");
    t += 31 * 60 * 1000; // 31 min depois
    expect(s.obter("5531999").autenticado).toBe(false); // resetou
  });

  it("tocar renova a expiração", () => {
    let t = 1_000_000;
    const s = criarSessions(30, () => t);
    const sess = s.obter("5531999");
    sess.autenticado = true;
    t += 20 * 60 * 1000;
    s.tocar("5531999");        // renova em +20min
    t += 20 * 60 * 1000;       // total 40min, mas só 20 desde o tocar
    expect(s.obter("5531999").autenticado).toBe(true);
  });

  it("limpar remove a sessão", () => {
    const s = criarSessions(30);
    s.obter("5531999").autenticado = true;
    s.limpar("5531999");
    expect(s.obter("5531999").autenticado).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- whatsappSessions`
Expected: FAIL (`Cannot find module '../src/whatsapp/sessions'`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/whatsapp/sessions.ts
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

/**
 * Store em memória por número. Coerente com a filosofia "sem banco": o histórico
 * vive na RAM do backend e some ao reiniciar. Sessões inativas expiram após `timeoutMin`.
 * `agora` é injetável para os testes.
 */
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- whatsappSessions`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/whatsapp/sessions.ts tests/whatsappSessions.test.ts
git commit -m "feat(whatsapp): store de sessão em memória com timeout"
```

---

## Task 2: Autenticação por senha

**Files:**
- Create: `src/whatsapp/auth.ts`
- Test: `tests/whatsappAuth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/whatsappAuth.test.ts
import { describe, it, expect } from "vitest";
import { decidirAuth } from "../src/whatsapp/auth";

describe("decidirAuth (senha na 1ª mensagem)", () => {
  const senha = "cafe123";

  it("já autenticado → segue", () => {
    expect(decidirAuth({ autenticado: true }, "quanto vendi hoje?", senha)).toBe("seguir");
  });

  it("não autenticado + senha correta → autentica", () => {
    expect(decidirAuth({ autenticado: false }, "cafe123", senha)).toBe("autenticar");
  });

  it("não autenticado + senha correta com espaços → autentica", () => {
    expect(decidirAuth({ autenticado: false }, "  cafe123 ", senha)).toBe("autenticar");
  });

  it("não autenticado + texto errado → pede senha", () => {
    expect(decidirAuth({ autenticado: false }, "oi", senha)).toBe("pedir_senha");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- whatsappAuth`
Expected: FAIL (`Cannot find module '../src/whatsapp/auth'`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/whatsapp/auth.ts
export type DecisaoAuth = "seguir" | "autenticar" | "pedir_senha";

/**
 * Decide o que fazer com uma mensagem, dado o estado de autenticação da sessão.
 * Senha na 1ª mensagem: enquanto não autenticado, só a senha correta libera.
 */
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- whatsappAuth`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/whatsapp/auth.ts tests/whatsappAuth.test.ts
git commit -m "feat(whatsapp): autenticação por senha na 1ª mensagem"
```

---

## Task 3: Cliente da Evolution (sendText)

**Files:**
- Create: `src/whatsapp/evolutionClient.ts`
- Test: `tests/whatsappEvolutionClient.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/whatsappEvolutionClient.test.ts
import { describe, it, expect, vi } from "vitest";
import { criarEvolutionClient } from "../src/whatsapp/evolutionClient";

describe("evolutionClient.sendText", () => {
  it("faz POST no endpoint da instância com apikey e body correto", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    const client = criarEvolutionClient(
      { url: "http://localhost:8080", apiKey: "K", instance: "canastra" },
      fetchMock as any,
    );
    await client.sendText("5531999", "olá");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8080/message/sendText/canastra");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("K");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ number: "5531999", text: "olá" });
  });

  it("não lança se a Evolution responder erro (só loga)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "erro" });
    const client = criarEvolutionClient({ url: "http://localhost:8080", apiKey: "K", instance: "i" }, fetchMock as any);
    await expect(client.sendText("5531999", "x")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- whatsappEvolutionClient`
Expected: FAIL (`Cannot find module '../src/whatsapp/evolutionClient'`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/whatsapp/evolutionClient.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- whatsappEvolutionClient`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/whatsapp/evolutionClient.ts tests/whatsappEvolutionClient.test.ts
git commit -m "feat(whatsapp): cliente da Evolution API (sendText)"
```

---

## Task 4: Webhook — parse do payload

**Files:**
- Create: `src/whatsapp/webhook.ts`
- Test: `tests/whatsappWebhook.test.ts`

Nesta task só o parser é implementado; a rota vem na Task 5 (mesmo arquivo).

- [ ] **Step 1: Write the failing test**

```ts
// tests/whatsappWebhook.test.ts
import { describe, it, expect } from "vitest";
import { parseMensagem } from "../src/whatsapp/webhook";

const base = (over: any = {}) => ({
  event: "messages.upsert",
  instance: "canastra",
  data: {
    key: { remoteJid: "5531999@s.whatsapp.net", fromMe: false, id: "abc" },
    message: { conversation: "quanto vendi hoje?" },
    ...over,
  },
});

describe("parseMensagem", () => {
  it("extrai numero e texto de conversation", () => {
    expect(parseMensagem(base())).toEqual({ numero: "5531999", texto: "quanto vendi hoje?" });
  });

  it("extrai texto de extendedTextMessage", () => {
    const body = base({ message: { extendedTextMessage: { text: "e no mês passado?" } } });
    expect(parseMensagem(body)).toEqual({ numero: "5531999", texto: "e no mês passado?" });
  });

  it("ignora mensagens próprias (fromMe)", () => {
    const body = base({ key: { remoteJid: "5531999@s.whatsapp.net", fromMe: true, id: "x" } });
    expect(parseMensagem(body)).toBeNull();
  });

  it("ignora grupos (@g.us)", () => {
    const body = base({ key: { remoteJid: "12345@g.us", fromMe: false, id: "x" } });
    expect(parseMensagem(body)).toBeNull();
  });

  it("ignora mensagens sem texto", () => {
    const body = base({ message: { imageMessage: {} } });
    expect(parseMensagem(body)).toBeNull();
  });

  it("ignora payload malformado", () => {
    expect(parseMensagem({})).toBeNull();
    expect(parseMensagem(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- whatsappWebhook`
Expected: FAIL (`Cannot find module '../src/whatsapp/webhook'`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/whatsapp/webhook.ts
export interface MensagemRecebida {
  numero: string;
  texto: string;
}

/**
 * Extrai numero + texto do payload `messages.upsert` da Evolution.
 * Retorna null para: próprias (fromMe), grupos (@g.us), sem texto, ou malformadas.
 */
export function parseMensagem(body: any): MensagemRecebida | null {
  const data = body?.data;
  const key = data?.key;
  if (!key || key.fromMe) return null;
  const jid: string = key.remoteJid ?? "";
  if (!jid || jid.endsWith("@g.us")) return null;
  const numero = jid.split("@")[0];
  const msg = data.message ?? {};
  const texto: string | undefined = msg.conversation ?? msg.extendedTextMessage?.text;
  if (!numero || !texto || typeof texto !== "string") return null;
  return { numero, texto };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- whatsappWebhook`
Expected: PASS (6 testes de parse).

- [ ] **Step 5: Commit**

```bash
git add src/whatsapp/webhook.ts tests/whatsappWebhook.test.ts
git commit -m "feat(whatsapp): parser do payload messages.upsert"
```

---

## Task 5: Webhook — handler (orquestração)

**Files:**
- Modify: `src/whatsapp/webhook.ts`
- Modify: `tests/whatsappWebhook.test.ts`

- [ ] **Step 1: Write the failing test** (adicionar ao arquivo existente)

```ts
// tests/whatsappWebhook.test.ts — adicionar imports e bloco
import { criarWebhookWhatsApp } from "../src/whatsapp/webhook";
import { criarSessions } from "../src/whatsapp/sessions";
import express from "express";
import request from "supertest";

function montarApp(over: Partial<any> = {}) {
  const enviados: Array<{ numero: string; texto: string }> = [];
  const evolution = { sendText: async (numero: string, texto: string) => { enviados.push({ numero, texto }); } };
  const runAgent = over.runAgent ?? (async () => ({ texto: "Você vendeu R$ 100 hoje." }));
  const sessions = over.sessions ?? criarSessions(30);
  const app = express();
  app.use(express.json());
  app.post("/api/whatsapp/webhook", criarWebhookWhatsApp({ runAgent, evolution, sessions, senha: "cafe123" }));
  return { app, enviados, sessions };
}

const evt = (numero: string, texto: string) => ({
  data: { key: { remoteJid: `${numero}@s.whatsapp.net`, fromMe: false, id: "x" }, message: { conversation: texto } },
});

describe("criarWebhookWhatsApp (handler)", () => {
  it("responde 200 sempre e ignora payload sem texto", async () => {
    const { app, enviados } = montarApp();
    await request(app).post("/api/whatsapp/webhook").send({ data: { key: { remoteJid: "1@g.us" } } }).expect(200);
    expect(enviados).toHaveLength(0);
  });

  it("número novo recebe pedido de senha e NÃO chama o agente", async () => {
    const runAgent = vi.fn(async () => ({ texto: "não deveria" }));
    const { app, enviados } = montarApp({ runAgent });
    await request(app).post("/api/whatsapp/webhook").send(evt("5531999", "oi")).expect(200);
    expect(runAgent).not.toHaveBeenCalled();
    expect(enviados[0].texto).toContain("senha");
  });

  it("senha correta autentica e confirma", async () => {
    const { app, enviados, sessions } = montarApp();
    await request(app).post("/api/whatsapp/webhook").send(evt("5531999", "cafe123")).expect(200);
    expect(sessions.obter("5531999").autenticado).toBe(true);
    expect(enviados[0].texto).toContain("liberado");
  });

  it("autenticado → chama o agente e responde o texto", async () => {
    const runAgent = vi.fn(async () => ({ texto: "Vendeu R$ 100." }));
    const { app, enviados, sessions } = montarApp({ runAgent });
    sessions.obter("5531999").autenticado = true;
    await request(app).post("/api/whatsapp/webhook").send(evt("5531999", "quanto vendi?")).expect(200);
    expect(runAgent).toHaveBeenCalledOnce();
    expect(enviados.some((e) => e.texto === "Vendeu R$ 100.")).toBe(true);
  });

  it("comando 'sair' limpa a sessão", async () => {
    const { app, sessions } = montarApp();
    sessions.obter("5531999").autenticado = true;
    await request(app).post("/api/whatsapp/webhook").send(evt("5531999", "sair")).expect(200);
    expect(sessions.obter("5531999").autenticado).toBe(false);
  });

  it("erro no agente responde mensagem amigável", async () => {
    const runAgent = vi.fn(async () => { throw new Error("boom"); });
    const { app, enviados, sessions } = montarApp({ runAgent });
    sessions.obter("5531999").autenticado = true;
    await request(app).post("/api/whatsapp/webhook").send(evt("5531999", "quanto vendi?")).expect(200);
    expect(enviados.some((e) => e.texto.includes("problema"))).toBe(true);
  });
});
```

Adicione `import { describe, it, expect, vi } from "vitest";` no topo se ainda não incluir `vi`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- whatsappWebhook`
Expected: FAIL (`criarWebhookWhatsApp` não existe).

- [ ] **Step 3: Write minimal implementation** (adicionar em `src/whatsapp/webhook.ts`)

```ts
// src/whatsapp/webhook.ts — adicionar imports no topo
import type { RequestHandler } from "express";
import type { Mensagem } from "../agent/agentLoop";
import type { SessionStore } from "./sessions";
import { decidirAuth } from "./auth";

export interface WebhookDeps {
  runAgent: (args: { mensagens: Mensagem[] }) => Promise<{ texto: string }>;
  evolution: { sendText: (numero: string, texto: string) => Promise<void> };
  sessions: SessionStore;
  senha: string;
}

const RESET = new Set(["sair", "recomeçar", "recomecar", "reset"]);

/**
 * Handler do webhook da Evolution. Responde 200 na hora (evita re-tentativa em loop) e
 * processa a mensagem: autenticação por senha → agente → resposta via sendText.
 */
export function criarWebhookWhatsApp(deps: WebhookDeps): RequestHandler {
  return (req, res) => {
    res.sendStatus(200); // responde já; processa em seguida
    const msg = parseMensagem(req.body);
    if (!msg) return;
    processar(deps, msg).catch((e) => console.error("[whatsapp] erro no processamento:", e));
  };
}

async function processar(deps: WebhookDeps, { numero, texto }: MensagemRecebida): Promise<void> {
  const { sessions, evolution } = deps;

  if (RESET.has(texto.trim().toLowerCase())) {
    sessions.limpar(numero);
    await evolution.sendText(numero, "🔄 Sessão reiniciada. Envie a senha de acesso para começar de novo.");
    return;
  }

  const sessao = sessions.obter(numero);
  const decisao = decidirAuth(sessao, texto, deps.senha);
  if (decisao === "pedir_senha") {
    await evolution.sendText(numero, "🔒 Envie a senha de acesso para usar o assistente.");
    return;
  }
  if (decisao === "autenticar") {
    sessao.autenticado = true;
    sessions.tocar(numero);
    await evolution.sendText(numero, "✅ Acesso liberado! Pode perguntar (ex.: \"quanto vendi hoje?\").");
    return;
  }

  // seguir: mensagem de um número já autenticado
  sessao.mensagens.push({ role: "user", content: texto });
  await evolution.sendText(numero, "🔎 Consultando…");
  try {
    const { texto: resposta } = await deps.runAgent({ mensagens: sessao.mensagens });
    sessao.mensagens.push({ role: "assistant", content: resposta });
    sessions.tocar(numero);
    await evolution.sendText(numero, resposta);
  } catch (e) {
    console.error("[whatsapp] runAgent falhou:", e);
    await evolution.sendText(numero, "⚠️ Tive um problema para consultar agora. Tente de novo em instantes.");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- whatsappWebhook`
Expected: PASS (parse + handler).

- [ ] **Step 5: Commit**

```bash
git add src/whatsapp/webhook.ts tests/whatsappWebhook.test.ts
git commit -m "feat(whatsapp): handler do webhook (auth, histórico, agente, reset)"
```

---

## Task 6: Config — envs do WhatsApp

**Files:**
- Modify: `src/config.ts`
- Modify: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test** (adicionar em `tests/config.test.ts`)

```ts
// tests/config.test.ts — adicionar dentro do describe existente
it("carrega config do WhatsApp e deriva 'habilitado'", () => {
  const cfg = loadConfig({
    ANTHROPIC_API_KEY: "a", BLING_CLIENT_ID: "b", BLING_CLIENT_SECRET: "c",
    APP_PASSWORD: "d", SESSION_SECRET: "e",
    EVOLUTION_API_URL: "http://localhost:8080", EVOLUTION_API_KEY: "K",
    EVOLUTION_INSTANCE: "canastra", WHATSAPP_ACCESS_PASSWORD: "cafe123",
  });
  expect(cfg.whatsapp.habilitado).toBe(true);
  expect(cfg.whatsapp.apiUrl).toBe("http://localhost:8080");
  expect(cfg.whatsapp.instance).toBe("canastra");
  expect(cfg.whatsapp.sessionTimeoutMin).toBe(30); // padrão
});

it("WhatsApp desligado quando faltam envs", () => {
  const cfg = loadConfig({
    ANTHROPIC_API_KEY: "a", BLING_CLIENT_ID: "b", BLING_CLIENT_SECRET: "c",
    APP_PASSWORD: "d", SESSION_SECRET: "e",
  });
  expect(cfg.whatsapp.habilitado).toBe(false);
});
```

Se `tests/config.test.ts` não importar `loadConfig`, adicione `import { loadConfig } from "../src/config";`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- config`
Expected: FAIL (`cfg.whatsapp` é undefined).

- [ ] **Step 3: Write minimal implementation** (modificar `src/config.ts`)

Adicione ao `interface AppConfig` (antes do fechamento `}`):

```ts
  whatsapp: {
    habilitado: boolean;
    apiUrl: string;
    apiKey: string;
    instance: string;
    accessPassword: string;
    sessionTimeoutMin: number;
  };
```

E no objeto retornado por `loadConfig` (antes do fechamento `};`):

```ts
    whatsapp: {
      apiUrl: env.EVOLUTION_API_URL || "http://localhost:8080",
      apiKey: env.EVOLUTION_API_KEY || "",
      instance: env.EVOLUTION_INSTANCE || "canastra",
      accessPassword: env.WHATSAPP_ACCESS_PASSWORD || "",
      sessionTimeoutMin: Number(env.WHATSAPP_SESSION_TIMEOUT_MIN || 30),
      // Canal ligado só quando temos key da Evolution + senha de acesso.
      get habilitado(): boolean {
        return Boolean(env.EVOLUTION_API_KEY && env.WHATSAPP_ACCESS_PASSWORD);
      },
    },
```

Nota: o `get habilitado` referencia `env` (fechado no escopo da função) — mantém a derivação simples e testável.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat(whatsapp): config das envs do canal (Evolution + senha)"
```

---

## Task 7: Montar a rota no servidor

**Files:**
- Modify: `src/server.ts`
- Test: `tests/whatsappWebhook.test.ts` (adicionar um teste de integração via `criarApp`)

- [ ] **Step 1: Write the failing test** (adicionar em `tests/whatsappWebhook.test.ts`)

```ts
// tests/whatsappWebhook.test.ts — novo bloco
import { criarApp } from "../src/server";

describe("criarApp monta o webhook do WhatsApp", () => {
  it("expõe POST /api/whatsapp/webhook quando handler é passado", async () => {
    const enviados: any[] = [];
    const sessions = criarSessions(30);
    const handler = criarWebhookWhatsApp({
      runAgent: async () => ({ texto: "ok" }),
      evolution: { sendText: async (n, t) => { enviados.push({ n, t }); } },
      sessions, senha: "cafe123",
    });
    const cfg = { appPassword: "x", sessionSecret: "s", corsOrigin: "*" } as any;
    const app = criarApp(cfg, { runAgent: async () => ({ texto: "ok" }), whatsappWebhook: handler });
    await request(app).post("/api/whatsapp/webhook")
      .send({ data: { key: { remoteJid: "5531999@s.whatsapp.net", fromMe: false }, message: { conversation: "oi" } } })
      .expect(200);
    expect(enviados[0].t).toContain("senha"); // número novo → pede senha
  });

  it("não expõe a rota quando handler não é passado", async () => {
    const cfg = { appPassword: "x", sessionSecret: "s", corsOrigin: "*" } as any;
    const app = criarApp(cfg, { runAgent: async () => ({ texto: "ok" }) });
    // sem handler, a rota cai no catch-all do SPA (200 com index) ou 404; garantimos que não processa
    const r = await request(app).post("/api/whatsapp/webhook").send({});
    expect([404, 200]).toContain(r.status);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- whatsappWebhook`
Expected: FAIL (`criarApp` não aceita `whatsappWebhook`).

- [ ] **Step 3: Write minimal implementation** (modificar `src/server.ts`)

No `interface ServerDeps`, adicione o campo:

```ts
  whatsappWebhook?: import("express").RequestHandler;
```

Depois do bloco do `app.post("/api/chat/stream", ...)` e **antes** do `express.static`/catch-all, adicione:

```ts
  // Canal WhatsApp (Evolution API): recebe mensagens por webhook. Sem Bearer — a
  // proteção é a senha na 1ª mensagem + o fato de rodar em rede local. Registrado só
  // quando o canal está habilitado (deps.whatsappWebhook definido).
  if (deps.whatsappWebhook) {
    app.post("/api/whatsapp/webhook", deps.whatsappWebhook);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- whatsappWebhook`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts tests/whatsappWebhook.test.ts
git commit -m "feat(whatsapp): monta a rota do webhook em criarApp (opcional)"
```

---

## Task 8: Fiar tudo no bootstrap

**Files:**
- Modify: `src/bootstrap.ts`

Sem teste dedicado (é fiação/composição; os módulos já têm cobertura). Validação: `npm run typecheck` + `npm test`.

- [ ] **Step 1: Implementar a fiação** (modificar `src/bootstrap.ts`)

Adicione os imports no topo:

```ts
import { criarSessions } from "./whatsapp/sessions";
import { criarEvolutionClient } from "./whatsapp/evolutionClient";
import { criarWebhookWhatsApp } from "./whatsapp/webhook";
```

Depois de definir `rotear` e **antes** de `const app = criarApp(...)`, monte o webhook (ou `undefined` se desligado):

```ts
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
```

Adicione `whatsappWebhook` ao objeto de deps passado para `criarApp`:

```ts
  const app = criarApp(cfg, {
    whatsappWebhook,
    runAgent: ({ mensagens }) => { /* ...igual ao atual... */ },
    runAgentStream: ({ mensagens, onEvent }) => { /* ...igual ao atual... */ },
  });
```

- [ ] **Step 2: Verificar typecheck e testes**

Run: `npm run typecheck && npm test`
Expected: sem erros de tipo; toda a suíte passa.

- [ ] **Step 3: Commit**

```bash
git add src/bootstrap.ts
git commit -m "feat(whatsapp): fiar o canal no bootstrap (reusa runAgent)"
```

---

## Task 9: Docker Compose (Evolution + Postgres)

**Files:**
- Create: `docker-compose.yml`

Sem teste automatizado (infra). Validação manual descrita nos critérios.

- [ ] **Step 1: Criar `docker-compose.yml`**

```yaml
# docker-compose.yml — Evolution API v2 + Postgres, para o canal WhatsApp.
# Sobe só a Evolution e o banco dela; o backend Node continua em `npm start`.
# A Evolution alcança o backend via host.docker.internal:3000.
services:
  evolution-api:
    image: atendai/evolution-api:v2.1.1
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - AUTHENTICATION_API_KEY=${EVOLUTION_API_KEY}
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://evolution:evolution@postgres:5432/evolution
      - DATABASE_SAVE_DATA_INSTANCE=true
      - DATABASE_SAVE_DATA_NEW_MESSAGE=false
      - DATABASE_SAVE_MESSAGE_UPDATE=false
      - DATABASE_SAVE_DATA_CONTACTS=false
      - DATABASE_SAVE_DATA_CHATS=false
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - evolution_instances:/evolution/instances
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    restart: unless-stopped
    environment:
      - POSTGRES_USER=evolution
      - POSTGRES_PASSWORD=evolution
      - POSTGRES_DB=evolution
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  evolution_instances:
  postgres_data:
```

- [ ] **Step 2: Validar o parse do compose**

Run: `docker compose config`
Expected: imprime a config resolvida sem erro. (Se `EVOLUTION_API_KEY` estiver no `.env`, aparece resolvida.)

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(whatsapp): docker-compose da Evolution API + Postgres"
```

---

## Task 10: Documentação (.env.example + README)

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Adicionar as envs ao `.env.example`**

```dotenv
# --- Canal WhatsApp (Evolution API) — opcional. Deixe vazio para desligar o canal. ---
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=            # mesma chave usada no docker-compose (AUTHENTICATION_API_KEY)
EVOLUTION_INSTANCE=canastra
WHATSAPP_ACCESS_PASSWORD=     # senha exigida na 1ª mensagem de cada número
WHATSAPP_SESSION_TIMEOUT_MIN=30
```

- [ ] **Step 2: Adicionar seção ao `README.md`** (após a seção de deploy/ngrok)

```markdown
## Canal WhatsApp (Evolution API, self-host)

O agente também atende pelo **WhatsApp**, com a **Evolution API** rodando localmente em Docker.
Tudo é local — **não precisa de ngrok** (a Evolution fala com o backend em `host.docker.internal`).

1. **Suba a Evolution + Postgres:**
   ```powershell
   docker compose up -d
   ```
2. **Crie a instância e pareie o WhatsApp:** abra `http://localhost:8080/manager`, entre com a
   `EVOLUTION_API_KEY`, crie uma instância chamada **`canastra`** (igual a `EVOLUTION_INSTANCE`) e
   leia o **QR Code** com o WhatsApp que será o número do bot.
3. **Configure o webhook da instância** (no manager, na instância `canastra`):
   - URL: `http://host.docker.internal:3000/api/whatsapp/webhook`
   - Evento: **`MESSAGES_UPSERT`** habilitado.
4. **Preencha o `.env`** (`EVOLUTION_API_KEY`, `WHATSAPP_ACCESS_PASSWORD`, etc.) e **suba o backend**
   (`npm start`). Se as envs do WhatsApp estiverem preenchidas, o log mostra `[whatsapp] canal habilitado`.
5. **Teste:** mande qualquer mensagem para o número → o bot pede a senha. Envie a
   `WHATSAPP_ACCESS_PASSWORD` → o bot libera. Agora pergunte "quanto vendi hoje?".
   Para reiniciar a sessão, envie **`sair`**.

> **Acesso:** cada número precisa enviar a senha na 1ª mensagem; a sessão expira após
> `WHATSAPP_SESSION_TIMEOUT_MIN` minutos de inatividade. Histórico vive em memória (some ao reiniciar o backend).
```

- [ ] **Step 3: Atualizar a linha "Fora do escopo" do README**

O README lista `WhatsApp` em "Fora do escopo". Remova `WhatsApp · ` dessa linha (agora está no escopo).

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs(whatsapp): setup do canal (Evolution, docker, webhook, senha)"
```

---

## Validação final (manual, com credenciais reais)

Após implementar todas as tasks:

1. `npm run typecheck && npm test` — tudo verde.
2. `docker compose up -d` → manager em `:8080`, cria instância `canastra`, pareia QR.
3. Configura webhook `MESSAGES_UPSERT` → `http://host.docker.internal:3000/api/whatsapp/webhook`.
4. `.env` preenchido, `npm start` → log `[whatsapp] canal habilitado`.
5. De um celular: manda "oi" → recebe pedido de senha. Manda a senha → "✅ liberado".
   Pergunta "quanto vendi hoje?" → resposta com dados reais do Bling.
6. Pergunta de acompanhamento "e no mês passado?" → mantém contexto.
7. Um número **sem** a senha nunca recebe dados do Bling.

## Notas de escopo

- Só **texto** (áudio/imagem fora).
- Sem streaming no WhatsApp (uma mensagem final; ack "🔎 Consultando…").
- Custo vai só para o log do backend.
- Backend sobe normalmente mesmo com o canal desligado (envs vazias).
