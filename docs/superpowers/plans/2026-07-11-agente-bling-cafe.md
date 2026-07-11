# Agente Bling Café — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para implementar task a task. Steps usam checkbox (`- [ ]`).
> **REGRA DE FRONTEND (obrigatória):** qualquer task que crie/edite UI em `web/` DEVE invocar a skill `frontend-design` e usar componentes **shadcn/ui**. Nunca escrever HTML/CSS genérico.

**Goal:** Site de chat que responde, em PT-BR e com dados ao vivo do Bling, perguntas sobre vendas, faturamento, estoque e produção do café, além de um relatório diário sob demanda.

**Architecture:** Backend Node+TypeScript (Express) expõe `/api/chat` que roda um agente Claude com *tool use*; as ferramentas fazem consultas somente-leitura ao Bling (OAuth2, token auto-renovável em arquivo, sem banco). Frontend React (Vite+Tailwind+shadcn) com login por senha e UI de chat; histórico vive no cliente.

**Tech Stack:** Node ≥20, TypeScript, Express, `@anthropic-ai/sdk`, `cookie-parser` (cookie assinado), `vitest`, `supertest`; frontend Vite+React+TS+Tailwind+shadcn/ui. Execução via `tsx` (sem build de backend). Package manager: npm.

**Convenções globais:**
- Módulos **ESM** (`"type": "module"`); imports com extensão `.js` nos arquivos TS compilados por `tsx` **não** são necessários ao usar `tsx` + `vitest` (resolvem `.ts`). Manter imports sem extensão.
- HTTP via `fetch` nativo. Datas sempre no fuso `America/Sao_Paulo`.
- Nunca logar segredos. Nenhuma rota/função escreve no Bling.

---

### Task 1: Scaffold do projeto e ferramentas

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `.editorconfig`
- Create (pastas vazias com `.gitkeep`): `src/`, `tests/`

- [ ] **Step 1: `git init` e `.gitignore`**

Run: `git init`

`.gitignore`:
```
node_modules/
.env
.bling-tokens.json
web/dist/
dist/
*.log
.DS_Store
```

- [ ] **Step 2: Criar `package.json`**

```json
{
  "name": "agente-bling-cafe",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "bling:auth": "tsx src/bling/authSetup.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.65.0",
    "cookie-parser": "^1.4.7",
    "express": "^4.21.2"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.8",
    "@types/express": "^4.17.21",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Run: `npm install`
Expected: instala sem erros; cria `node_modules/` e `package-lock.json`.

- [ ] **Step 3: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"],
    "outDir": "dist"
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globals: true, environment: "node", include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 5: `.env.example`**

```
# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5

# Bling OAuth (API v3)
BLING_CLIENT_ID=
BLING_CLIENT_SECRET=
BLING_REDIRECT_URI=http://localhost:3000/api/bling/callback
# IDs (separados por vírgula) das situações consideradas "faturado" na sua conta Bling
BLING_SITUACAO_FATURADO_IDS=

# App
APP_PASSWORD=troque-esta-senha
SESSION_SECRET=gere-um-segredo-aleatorio-longo
PORT=3000
```

- [ ] **Step 6: Verificar e commitar**

Run: `npm run test` → Expected: vitest roda e reporta "No test files found" (ok nesta fase).
```bash
git add -A
git commit -m "chore: scaffold do projeto (ts, vitest, express)"
```

---

### Task 2: Carregamento e validação de configuração

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Escrever teste que falha**

```ts
// tests/config.test.ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("lança erro listando variáveis obrigatórias ausentes", () => {
    expect(() => loadConfig({})).toThrowError(/ANTHROPIC_API_KEY/);
  });

  it("carrega e aplica defaults quando as obrigatórias existem", () => {
    const cfg = loadConfig({
      ANTHROPIC_API_KEY: "k", BLING_CLIENT_ID: "id", BLING_CLIENT_SECRET: "sec",
      APP_PASSWORD: "p", SESSION_SECRET: "s",
    });
    expect(cfg.anthropicModel).toBe("claude-haiku-4-5");
    expect(cfg.port).toBe(3000);
    expect(cfg.blingSituacaoFaturadoIds).toEqual([]);
  });

  it("parseia IDs de situação separados por vírgula", () => {
    const cfg = loadConfig({
      ANTHROPIC_API_KEY: "k", BLING_CLIENT_ID: "id", BLING_CLIENT_SECRET: "sec",
      APP_PASSWORD: "p", SESSION_SECRET: "s", BLING_SITUACAO_FATURADO_IDS: "9, 12 ,15",
    });
    expect(cfg.blingSituacaoFaturadoIds).toEqual([9, 12, 15]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test` → Expected: FAIL ("Cannot find module ../src/config").

- [ ] **Step 3: Implementar**

```ts
// src/config.ts
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
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test` → Expected: PASS (3 testes).

- [ ] **Step 5: Commit**
```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: config loader com validação de env"
```

---

### Task 3: Resolução de períodos (fuso America/Sao_Paulo)

**Files:**
- Create: `src/util/periodo.ts`
- Test: `tests/periodo.test.ts`

Contrato: `resolverPeriodo(periodo, hoje?)` → `{ dataInicial: "YYYY-MM-DD", dataFinal: "YYYY-MM-DD" }`.
Semana começa **segunda-feira**. `hoje` injetável para testes determinísticos.

- [ ] **Step 1: Teste que falha**

```ts
// tests/periodo.test.ts
import { describe, it, expect } from "vitest";
import { resolverPeriodo } from "../src/util/periodo";

// Quarta-feira, 2026-07-08
const REF = new Date("2026-07-08T12:00:00-03:00");

describe("resolverPeriodo", () => {
  it("hoje", () => expect(resolverPeriodo("hoje", REF)).toEqual({ dataInicial: "2026-07-08", dataFinal: "2026-07-08" }));
  it("ontem", () => expect(resolverPeriodo("ontem", REF)).toEqual({ dataInicial: "2026-07-07", dataFinal: "2026-07-07" }));
  it("esta_semana (segunda a hoje)", () =>
    expect(resolverPeriodo("esta_semana", REF)).toEqual({ dataInicial: "2026-07-06", dataFinal: "2026-07-08" }));
  it("semana_passada (segunda a domingo)", () =>
    expect(resolverPeriodo("semana_passada", REF)).toEqual({ dataInicial: "2026-06-29", dataFinal: "2026-07-05" }));
  it("este_mes", () =>
    expect(resolverPeriodo("este_mes", REF)).toEqual({ dataInicial: "2026-07-01", dataFinal: "2026-07-08" }));
  it("mes_passado", () =>
    expect(resolverPeriodo("mes_passado", REF)).toEqual({ dataInicial: "2026-06-01", dataFinal: "2026-06-30" }));
  it("personalizado usa as datas fornecidas", () =>
    expect(resolverPeriodo("personalizado", REF, "2026-01-01", "2026-01-31"))
      .toEqual({ dataInicial: "2026-01-01", dataFinal: "2026-01-31" }));
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/periodo.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar** (trabalhar em datas civis no fuso de SP via offset fixo -03:00; suficiente para o MVP)

```ts
// src/util/periodo.ts
export type Periodo =
  | "hoje" | "ontem" | "esta_semana" | "semana_passada"
  | "este_mes" | "mes_passado" | "personalizado";

export interface IntervaloDatas { dataInicial: string; dataFinal: string; }

// Representa "agora" em SP como um UTC deslocado, e opera só com a parte de data.
function partesSP(d: Date) {
  const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000); // -03:00
  return { y: sp.getUTCFullYear(), m: sp.getUTCMonth(), d: sp.getUTCDate() };
}
function ymd(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m, d));
  return dt.toISOString().slice(0, 10);
}
// 0=segunda ... 6=domingo
function diaSemanaSegunda(y: number, m: number, d: number): number {
  return (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7;
}

export function resolverPeriodo(
  periodo: Periodo, hoje: Date = new Date(), dataInicial?: string, dataFinal?: string,
): IntervaloDatas {
  if (periodo === "personalizado") {
    if (!dataInicial || !dataFinal) throw new Error("período personalizado exige dataInicial e dataFinal");
    return { dataInicial, dataFinal };
  }
  const { y, m, d } = partesSP(hoje);
  const hojeStr = ymd(y, m, d);
  switch (periodo) {
    case "hoje": return { dataInicial: hojeStr, dataFinal: hojeStr };
    case "ontem": { const o = ymd(y, m, d - 1); return { dataInicial: o, dataFinal: o }; }
    case "esta_semana": {
      const off = diaSemanaSegunda(y, m, d);
      return { dataInicial: ymd(y, m, d - off), dataFinal: hojeStr };
    }
    case "semana_passada": {
      const off = diaSemanaSegunda(y, m, d);
      return { dataInicial: ymd(y, m, d - off - 7), dataFinal: ymd(y, m, d - off - 1) };
    }
    case "este_mes": return { dataInicial: ymd(y, m, 1), dataFinal: hojeStr };
    case "mes_passado": return { dataInicial: ymd(y, m - 1, 1), dataFinal: ymd(y, m, 0) };
  }
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/periodo.test.ts` → Expected: PASS (7 testes).

- [ ] **Step 5: Commit**
```bash
git add src/util/periodo.ts tests/periodo.test.ts
git commit -m "feat: resolverPeriodo com fuso de SP"
```

---

### Task 4: Token manager do Bling (persistência + refresh)

**Files:**
- Create: `src/bling/tokenManager.ts`
- Test: `tests/tokenManager.test.ts`

Contrato:
- `TokenManager` recebe `{ clientId, clientSecret, tokenFile, fetchImpl?, now? }`.
- `getAccessToken()`: retorna token válido; se `expires_at` passou (com margem de 60s), chama refresh.
- `setTokens(resp)`: persiste `{ access_token, refresh_token, expires_at }` em JSON.
- Endpoint de token: `POST https://api.bling.com.br/Api/v3/oauth/token` com header
  `Authorization: Basic base64(clientId:clientSecret)`, corpo `application/x-www-form-urlencoded`.

- [ ] **Step 1: Teste que falha** (fetch e relógio mockados, arquivo temporário)

```ts
// tests/tokenManager.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TokenManager } from "../src/bling/tokenManager";

const tmp = () => path.join(os.tmpdir(), `bling-tok-${Math.random().toString(36).slice(2)}.json`);

describe("TokenManager", () => {
  let file: string;
  beforeEach(async () => { file = tmp(); });

  it("renova quando o token está expirado e persiste o novo", async () => {
    await fs.writeFile(file, JSON.stringify({ access_token: "velho", refresh_token: "r1", expires_at: 1000 }));
    const calls: any[] = [];
    const fetchImpl = async (url: string, init: any) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ access_token: "novo", refresh_token: "r2", expires_in: 3600 }) } as any;
    };
    const tm = new TokenManager({ clientId: "c", clientSecret: "s", tokenFile: file, fetchImpl, now: () => 2_000_000 });
    const tok = await tm.getAccessToken();
    expect(tok).toBe("novo");
    expect(calls[0].url).toContain("/oauth/token");
    expect(calls[0].init.headers.Authorization).toBe("Basic " + Buffer.from("c:s").toString("base64"));
    expect(calls[0].init.body).toContain("grant_type=refresh_token");
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    expect(saved.access_token).toBe("novo");
    expect(saved.refresh_token).toBe("r2");
  });

  it("não renova quando o token ainda é válido", async () => {
    await fs.writeFile(file, JSON.stringify({ access_token: "ok", refresh_token: "r", expires_at: 9_999_999_999 }));
    let called = false;
    const tm = new TokenManager({ clientId: "c", clientSecret: "s", tokenFile: file,
      fetchImpl: async () => { called = true; return {} as any; }, now: () => 1000 });
    expect(await tm.getAccessToken()).toBe("ok");
    expect(called).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/tokenManager.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/bling/tokenManager.ts
import { promises as fs } from "node:fs";

const TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";
const MARGIN_MS = 60_000;

export interface StoredTokens { access_token: string; refresh_token: string; expires_at: number; }
interface TokenResponse { access_token: string; refresh_token: string; expires_in: number; }

export interface TokenManagerOpts {
  clientId: string; clientSecret: string; tokenFile: string;
  fetchImpl?: typeof fetch; now?: () => number;
}

export class TokenManager {
  private o: Required<TokenManagerOpts>;
  constructor(opts: TokenManagerOpts) {
    this.o = { fetchImpl: fetch, now: () => Date.now(), ...opts };
  }
  private basic() { return "Basic " + Buffer.from(`${this.o.clientId}:${this.o.clientSecret}`).toString("base64"); }

  private async read(): Promise<StoredTokens> {
    return JSON.parse(await fs.readFile(this.o.tokenFile, "utf8"));
  }
  async setTokens(r: TokenResponse): Promise<void> {
    const data: StoredTokens = {
      access_token: r.access_token, refresh_token: r.refresh_token,
      expires_at: this.o.now() + r.expires_in * 1000,
    };
    await fs.writeFile(this.o.tokenFile, JSON.stringify(data, null, 2));
  }

  async getAccessToken(): Promise<string> {
    const t = await this.read();
    if (this.o.now() < t.expires_at - MARGIN_MS) return t.access_token;
    return this.refresh(t.refresh_token);
  }

  async refresh(refreshToken: string): Promise<string> {
    const res = await this.o.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: this.basic(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
    });
    if (!res.ok) throw new Error(`Falha ao renovar token Bling (HTTP ${res.status}). Re-autentique via 'npm run bling:auth'.`);
    const json = (await res.json()) as TokenResponse;
    await this.setTokens(json);
    return json.access_token;
  }

  // Usado pelo fluxo de setup para a troca inicial code -> token.
  async exchangeCode(code: string, redirectUri: string): Promise<void> {
    const res = await this.o.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: this.basic(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
    });
    if (!res.ok) throw new Error(`Falha na troca de code por token (HTTP ${res.status}).`);
    await this.setTokens((await res.json()) as TokenResponse);
  }
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/tokenManager.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/bling/tokenManager.ts tests/tokenManager.test.ts
git commit -m "feat: token manager do Bling com refresh"
```

---

### Task 5: Fluxo de setup OAuth (obter o primeiro token)

**⚠️ VERIFICAÇÃO OBRIGATÓRIA:** Antes de codar, o subagente deve abrir `https://developer.bling.com.br/referencia` (via WebFetch) e **confirmar a URL de `authorize`** e os parâmetros. Padrão esperado:
`https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=...&state=...&redirect_uri=...`. Ajustar se a doc divergir.

**Files:**
- Create: `src/bling/authSetup.ts` (script CLI para `npm run bling:auth`)

Comportamento: sobe um servidor HTTP efêmero na porta do `redirect_uri`, imprime no console a URL de autorização para o usuário abrir no navegador, recebe o `code` no callback, chama `tokenManager.exchangeCode`, grava `.bling-tokens.json` e encerra com mensagem de sucesso.

- [ ] **Step 1: Implementar `authSetup.ts`**

```ts
// src/bling/authSetup.ts
import http from "node:http";
import { randomBytes } from "node:crypto";
import { loadConfig } from "../config";
import { TokenManager } from "./tokenManager";

const cfg = loadConfig();
const state = randomBytes(8).toString("hex");
const url = new URL(cfg.blingRedirectUri);
const tm = new TokenManager({ clientId: cfg.blingClientId, clientSecret: cfg.blingClientSecret, tokenFile: ".bling-tokens.json" });

const authorizeUrl =
  `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code` +
  `&client_id=${encodeURIComponent(cfg.blingClientId)}&state=${state}` +
  `&redirect_uri=${encodeURIComponent(cfg.blingRedirectUri)}`;

console.log("\n1) Abra esta URL no navegador e autorize o app:\n\n" + authorizeUrl + "\n");

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url!, `http://localhost:${url.port}`);
  if (reqUrl.pathname !== url.pathname) { res.writeHead(404).end(); return; }
  const code = reqUrl.searchParams.get("code");
  const gotState = reqUrl.searchParams.get("state");
  if (!code || gotState !== state) { res.writeHead(400).end("code/state inválido"); return; }
  try {
    await tm.exchangeCode(code, cfg.blingRedirectUri);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end("<h2>Bling conectado! Pode fechar esta aba.</h2>");
    console.log("\n✅ Token salvo em .bling-tokens.json\n");
  } catch (e) {
    res.writeHead(500).end(String(e));
    console.error(e);
  } finally {
    setTimeout(() => server.close(() => process.exit(0)), 500);
  }
});
server.listen(Number(url.port), () => console.log(`2) Aguardando callback em ${cfg.blingRedirectUri} ...`));
```

- [ ] **Step 2: Verificação manual (documentar, não automatizar):** com `.env` preenchido, rodar `npm run bling:auth`, autorizar no navegador, confirmar criação de `.bling-tokens.json`. *(Executar de fato só quando o usuário tiver o app Bling configurado; caso contrário, marcar como pendente e seguir.)*

- [ ] **Step 3: Commit**
```bash
git add src/bling/authSetup.ts
git commit -m "feat: fluxo de setup OAuth do Bling"
```

---

### Task 6: Cliente HTTP do Bling (throttle + paginação + erros)

**Files:**
- Create: `src/bling/blingClient.ts`
- Test: `tests/blingClient.test.ts`

Contrato:
- `BlingClient({ tokenManager, fetchImpl?, minIntervalMs? })`.
- `get(path, query?)`: injeta `Authorization: Bearer <token>`; em **401** faz refresh e 1 retry; em **429** aguarda `Retry-After` (ou backoff) e 1 retry; respeita intervalo mínimo entre requisições (default 350ms).
- `getAllPages(path, query?, { limite=100, maxPaginas=20 })`: percorre `pagina` acumulando `data` até página incompleta ou teto.

- [ ] **Step 1: Teste que falha**

```ts
// tests/blingClient.test.ts
import { describe, it, expect } from "vitest";
import { BlingClient } from "../src/bling/blingClient";

const tmFake = { getAccessToken: async () => "tok", refresh: async () => "tok2" } as any;

describe("BlingClient", () => {
  it("faz GET com Bearer e retorna data", async () => {
    const fetchImpl = async (url: string, init: any) => {
      expect(init.headers.Authorization).toBe("Bearer tok");
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 1 }] }) } as any;
    };
    const c = new BlingClient({ tokenManager: tmFake, fetchImpl, minIntervalMs: 0 });
    expect(await c.get("/produtos")).toEqual({ data: [{ id: 1 }] });
  });

  it("em 401 renova token e refaz a chamada", async () => {
    let n = 0;
    const fetchImpl = async (_url: string, _init: any) => {
      n++;
      if (n === 1) return { ok: false, status: 401, json: async () => ({}) } as any;
      return { ok: true, status: 200, json: async () => ({ data: [] }) } as any;
    };
    const c = new BlingClient({ tokenManager: tmFake, fetchImpl, minIntervalMs: 0 });
    await c.get("/produtos");
    expect(n).toBe(2);
  });

  it("getAllPages acumula até página incompleta", async () => {
    const fetchImpl = async (url: string) => {
      const pagina = Number(new URL(url).searchParams.get("pagina"));
      const data = pagina === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: i })) : [{ id: 999 }];
      return { ok: true, status: 200, json: async () => ({ data }) } as any;
    };
    const c = new BlingClient({ tokenManager: tmFake, fetchImpl, minIntervalMs: 0 });
    const all = await c.getAllPages("/pedidos/vendas", {}, { limite: 100, maxPaginas: 20 });
    expect(all.length).toBe(101);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/blingClient.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/bling/blingClient.ts
const BASE = "https://api.bling.com.br/Api/v3";

interface Opts { tokenManager: { getAccessToken(): Promise<string>; refresh(rt: string): Promise<string> };
  fetchImpl?: typeof fetch; minIntervalMs?: number; }

export class BlingClient {
  private fetchImpl: typeof fetch;
  private minIntervalMs: number;
  private last = 0;
  constructor(private o: Opts) {
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.minIntervalMs = o.minIntervalMs ?? 350;
  }
  private async throttle() {
    const wait = this.last + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
  }
  private buildUrl(path: string, query: Record<string, unknown> = {}) {
    const u = new URL(BASE + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    return u.toString();
  }
  async get<T = any>(path: string, query: Record<string, unknown> = {}, _retried = false): Promise<T> {
    await this.throttle();
    const token = await this.o.tokenManager.getAccessToken();
    const res = await this.fetchImpl(this.buildUrl(path, query), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 401 && !_retried) { return this.get<T>(path, query, true); }
    if (res.status === 429 && !_retried) {
      const ra = Number(res.headers?.get?.("Retry-After")) || 1;
      await new Promise((r) => setTimeout(r, ra * 1000));
      return this.get<T>(path, query, true);
    }
    if (!res.ok) throw new Error(`Bling GET ${path} falhou (HTTP ${res.status})`);
    return (await res.json()) as T;
  }
  async getAllPages<T = any>(path: string, query: Record<string, unknown> = {},
    { limite = 100, maxPaginas = 20 } = {}): Promise<T[]> {
    const out: T[] = [];
    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      const resp = await this.get<{ data: T[] }>(path, { ...query, pagina, limite });
      const data = resp.data ?? [];
      out.push(...data);
      if (data.length < limite) break;
    }
    return out;
  }
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/blingClient.test.ts` → Expected: PASS (3 testes).

- [ ] **Step 5: Commit**
```bash
git add src/bling/blingClient.ts tests/blingClient.test.ts
git commit -m "feat: cliente HTTP do Bling (throttle, paginação, 401/429)"
```

---

### Task 7: Funções de endpoint por recurso

**⚠️ VERIFICAÇÃO:** Confirmar via `https://developer.bling.com.br/referencia` os paths/params reais de `/pedidos/vendas`, `/estoques/saldos`, `/produtos`, `/ordens-producao`. Ajustar nomes de query (`dataInicial`/`dataFinal`) conforme a doc. Manter as **assinaturas** abaixo.

**Files:**
- Create: `src/bling/endpoints.ts`
- Test: `tests/endpoints.test.ts`

- [ ] **Step 1: Teste que falha** (BlingClient fake capturando chamadas)

```ts
// tests/endpoints.test.ts
import { describe, it, expect } from "vitest";
import { listarPedidosVenda, listarSaldosEstoque, listarOrdensProducao } from "../src/bling/endpoints";

function fakeClient(pages: any[]) {
  const calls: any[] = [];
  return {
    calls,
    client: { getAllPages: async (path: string, query: any) => { calls.push({ path, query }); return pages; } } as any,
  };
}

describe("endpoints", () => {
  it("listarPedidosVenda passa filtro de datas", async () => {
    const { client, calls } = fakeClient([{ id: 1, total: 50 }]);
    const r = await listarPedidosVenda(client, { dataInicial: "2026-07-01", dataFinal: "2026-07-08" });
    expect(calls[0].path).toBe("/pedidos/vendas");
    expect(calls[0].query.dataInicial).toBe("2026-07-01");
    expect(r).toHaveLength(1);
  });
  it("listarOrdensProducao aceita filtro opcional", async () => {
    const { client, calls } = fakeClient([]);
    await listarOrdensProducao(client, { dataInicial: "2026-07-01", dataFinal: "2026-07-08" });
    expect(calls[0].path).toBe("/ordens-producao");
  });
  it("listarSaldosEstoque chama o recurso de saldos", async () => {
    const { client, calls } = fakeClient([{ produto: { id: 1 }, saldoVirtualTotal: 10 }]);
    await listarSaldosEstoque(client);
    expect(calls[0].path).toBe("/estoques/saldos");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/endpoints.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/bling/endpoints.ts
import type { BlingClient } from "./blingClient";

export interface FiltroData { dataInicial: string; dataFinal: string; situacoes?: number[]; }

export async function listarPedidosVenda(c: BlingClient, f: FiltroData): Promise<any[]> {
  const query: Record<string, unknown> = { dataInicial: f.dataInicial, dataFinal: f.dataFinal };
  if (f.situacoes?.length) query["idsSituacoes[]"] = f.situacoes.join(",");
  return c.getAllPages("/pedidos/vendas", query);
}
export async function obterPedidoVenda(c: BlingClient, id: number): Promise<any> {
  return c.get(`/pedidos/vendas/${id}`);
}
export async function listarSaldosEstoque(c: BlingClient): Promise<any[]> {
  return c.getAllPages("/estoques/saldos");
}
export async function listarProdutos(c: BlingClient): Promise<any[]> {
  return c.getAllPages("/produtos");
}
export async function listarOrdensProducao(c: BlingClient, f: FiltroData): Promise<any[]> {
  return c.getAllPages("/ordens-producao", { dataInicial: f.dataInicial, dataFinal: f.dataFinal });
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/endpoints.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/bling/endpoints.ts tests/endpoints.test.ts
git commit -m "feat: funções de endpoint do Bling"
```

---

### Task 8: Ferramenta consultar_vendas

**Files:**
- Create: `src/tools/consultarVendas.ts`
- Test: `tests/consultarVendas.test.ts`

Contrato: `consultarVendas(deps, args)` onde `deps = { client, hoje? }` e `args = { periodo, dataInicial?, dataFinal? }`.
Retorna `{ periodo: {dataInicial,dataFinal}, numeroPedidos, valorTotal, ticketMedio }`. (Top produtos entra na Task de relatório como best-effort; aqui foco nos agregados confiáveis.)

- [ ] **Step 1: Teste que falha**

```ts
// tests/consultarVendas.test.ts
import { describe, it, expect } from "vitest";
import { consultarVendas } from "../src/tools/consultarVendas";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = { getAllPages: async () => [{ id: 1, total: 100 }, { id: 2, total: 50 }] } as any;

describe("consultarVendas", () => {
  it("agrega total, contagem e ticket médio", async () => {
    const r = await consultarVendas({ client, hoje: REF }, { periodo: "hoje" });
    expect(r.numeroPedidos).toBe(2);
    expect(r.valorTotal).toBe(150);
    expect(r.ticketMedio).toBe(75);
    expect(r.periodo).toEqual({ dataInicial: "2026-07-08", dataFinal: "2026-07-08" });
  });
  it("lida com período vazio", async () => {
    const vazio = { getAllPages: async () => [] } as any;
    const r = await consultarVendas({ client: vazio, hoje: REF }, { periodo: "hoje" });
    expect(r.numeroPedidos).toBe(0);
    expect(r.ticketMedio).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/consultarVendas.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/tools/consultarVendas.ts
import type { BlingClient } from "../bling/blingClient";
import { listarPedidosVenda } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface VendasDeps { client: BlingClient; hoje?: Date; }
export interface VendasArgs { periodo: Periodo; dataInicial?: string; dataFinal?: string; }

export async function consultarVendas(deps: VendasDeps, args: VendasArgs) {
  const periodo = resolverPeriodo(args.periodo, deps.hoje ?? new Date(), args.dataInicial, args.dataFinal);
  const pedidos = await listarPedidosVenda(deps.client, periodo);
  const valorTotal = pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const numeroPedidos = pedidos.length;
  return {
    periodo,
    numeroPedidos,
    valorTotal: Math.round(valorTotal * 100) / 100,
    ticketMedio: numeroPedidos ? Math.round((valorTotal / numeroPedidos) * 100) / 100 : 0,
  };
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/consultarVendas.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/tools/consultarVendas.ts tests/consultarVendas.test.ts
git commit -m "feat: ferramenta consultar_vendas"
```

---

### Task 9: Ferramenta consultar_faturamento

**Files:**
- Create: `src/tools/consultarFaturamento.ts`
- Test: `tests/consultarFaturamento.test.ts`

Contrato: `consultarFaturamento(deps, args)`, `deps = { client, hoje?, situacoesFaturado: number[] }`.
Filtra pedidos por `situacoes`. Se `args.comparar_anterior`, calcula também o período imediatamente anterior de mesma duração e a variação %.

- [ ] **Step 1: Teste que falha**

```ts
// tests/consultarFaturamento.test.ts
import { describe, it, expect } from "vitest";
import { consultarFaturamento } from "../src/tools/consultarFaturamento";

const REF = new Date("2026-07-08T12:00:00-03:00");

describe("consultarFaturamento", () => {
  it("soma faturamento do período filtrando por situação", async () => {
    const calls: any[] = [];
    const client = { getAllPages: async (_p: string, q: any) => { calls.push(q); return [{ total: 200 }, { total: 300 }]; } } as any;
    const r = await consultarFaturamento({ client, hoje: REF, situacoesFaturado: [9] }, { periodo: "hoje" });
    expect(r.faturamento).toBe(500);
    expect(calls[0]["idsSituacoes[]"]).toBe("9");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/consultarFaturamento.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/tools/consultarFaturamento.ts
import type { BlingClient } from "../bling/blingClient";
import { listarPedidosVenda } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface FatDeps { client: BlingClient; hoje?: Date; situacoesFaturado: number[]; }
export interface FatArgs { periodo: Periodo; dataInicial?: string; dataFinal?: string; comparar_anterior?: boolean; }

async function somaPeriodo(client: BlingClient, sit: number[], p: { dataInicial: string; dataFinal: string }) {
  const pedidos = await listarPedidosVenda(client, { ...p, situacoes: sit });
  const total = pedidos.reduce((s, x) => s + (Number(x.total) || 0), 0);
  return { total: Math.round(total * 100) / 100, numeroPedidos: pedidos.length };
}

export async function consultarFaturamento(deps: FatDeps, args: FatArgs) {
  const hoje = deps.hoje ?? new Date();
  const p = resolverPeriodo(args.periodo, hoje, args.dataInicial, args.dataFinal);
  const atual = await somaPeriodo(deps.client, deps.situacoesFaturado, p);
  const out: any = {
    periodo: p, faturamento: atual.total, numeroPedidos: atual.numeroPedidos,
    observacao: "Aproximado por pedidos com situação faturada (não NF-e).",
  };
  if (args.comparar_anterior) {
    const dias = Math.round((Date.parse(p.dataFinal) - Date.parse(p.dataInicial)) / 86400000) + 1;
    const fim = new Date(Date.parse(p.dataInicial) - 86400000);
    const ini = new Date(fim.getTime() - (dias - 1) * 86400000);
    const anterior = await somaPeriodo(deps.client, deps.situacoesFaturado,
      { dataInicial: ini.toISOString().slice(0, 10), dataFinal: fim.toISOString().slice(0, 10) });
    out.periodoAnterior = anterior;
    out.variacaoPercentual = anterior.total ? Math.round(((atual.total - anterior.total) / anterior.total) * 1000) / 10 : null;
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/consultarFaturamento.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/tools/consultarFaturamento.ts tests/consultarFaturamento.test.ts
git commit -m "feat: ferramenta consultar_faturamento"
```

---

### Task 10: Ferramenta consultar_estoque

**Files:**
- Create: `src/tools/consultarEstoque.ts`
- Test: `tests/consultarEstoque.test.ts`

**⚠️ VERIFICAÇÃO:** confirmar os nomes reais dos campos de saldo/estoque mínimo no retorno de `/estoques/saldos` e `/produtos`. Adaptar o mapeamento mantendo a assinatura/saída.

Contrato: `consultarEstoque(deps, args)`, `args = { filtro: "abaixo_minimo"|"todos"|"busca", termo? }`. Junta produtos com seus saldos e aplica o filtro.

- [ ] **Step 1: Teste que falha**

```ts
// tests/consultarEstoque.test.ts
import { describe, it, expect } from "vitest";
import { consultarEstoque } from "../src/tools/consultarEstoque";

const client = {
  getAllPages: async (path: string) => {
    if (path === "/produtos") return [
      { id: 1, nome: "Café Torrado 250g", codigo: "CT250", estoque: { minimo: 20 } },
      { id: 2, nome: "Café Moído 500g", codigo: "CM500", estoque: { minimo: 5 } },
    ];
    if (path === "/estoques/saldos") return [
      { produto: { id: 1 }, saldoVirtualTotal: 8 },
      { produto: { id: 2 }, saldoVirtualTotal: 40 },
    ];
    return [];
  },
} as any;

describe("consultarEstoque", () => {
  it("filtra itens abaixo do mínimo", async () => {
    const r = await consultarEstoque({ client }, { filtro: "abaixo_minimo" });
    expect(r.itens.map((i: any) => i.id)).toEqual([1]);
  });
  it("busca por termo no nome", async () => {
    const r = await consultarEstoque({ client }, { filtro: "busca", termo: "moído" });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].id).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/consultarEstoque.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/tools/consultarEstoque.ts
import type { BlingClient } from "../bling/blingClient";
import { listarProdutos, listarSaldosEstoque } from "../bling/endpoints";

export interface EstoqueDeps { client: BlingClient; }
export interface EstoqueArgs { filtro: "abaixo_minimo" | "todos" | "busca"; termo?: string; }

function normaliza(s: string) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

export async function consultarEstoque(deps: EstoqueDeps, args: EstoqueArgs) {
  const [produtos, saldos] = await Promise.all([listarProdutos(deps.client), listarSaldosEstoque(deps.client)]);
  const saldoPorId = new Map<number, number>();
  for (const s of saldos) saldoPorId.set(s.produto?.id, Number(s.saldoVirtualTotal) || 0);

  let itens = produtos.map((p) => ({
    id: p.id, nome: p.nome, codigo: p.codigo,
    saldo: saldoPorId.get(p.id) ?? 0, minimo: Number(p.estoque?.minimo) || 0,
  }));

  if (args.filtro === "abaixo_minimo") itens = itens.filter((i) => i.minimo > 0 && i.saldo < i.minimo);
  else if (args.filtro === "busca") {
    const t = normaliza(args.termo || "");
    itens = itens.filter((i) => normaliza(i.nome || "").includes(t) || normaliza(i.codigo || "").includes(t));
  }
  return { filtro: args.filtro, total: itens.length, itens: itens.slice(0, 100) };
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/consultarEstoque.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/tools/consultarEstoque.ts tests/consultarEstoque.test.ts
git commit -m "feat: ferramenta consultar_estoque"
```

---

### Task 11: Ferramenta consultar_producao

**Files:**
- Create: `src/tools/consultarProducao.ts`
- Test: `tests/consultarProducao.test.ts`

**⚠️ VERIFICAÇÃO:** confirmar campos reais de `/ordens-producao` (quantidade, situação, produto). Adaptar mapeamento mantendo a saída.

Contrato: `consultarProducao(deps, args)`, `args = { periodo, situacao?: "abertas"|"concluidas"|"todas", dataInicial?, dataFinal? }`. Retorna nº de ordens e quantidade total produzida no período.

- [ ] **Step 1: Teste que falha**

```ts
// tests/consultarProducao.test.ts
import { describe, it, expect } from "vitest";
import { consultarProducao } from "../src/tools/consultarProducao";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = { getAllPages: async () => [
  { id: 1, quantidade: 100, situacao: "concluida" },
  { id: 2, quantidade: 50, situacao: "aberta" },
] } as any;

describe("consultarProducao", () => {
  it("soma quantidade e conta ordens do período", async () => {
    const r = await consultarProducao({ client, hoje: REF }, { periodo: "esta_semana", situacao: "todas" });
    expect(r.numeroOrdens).toBe(2);
    expect(r.quantidadeTotal).toBe(150);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/consultarProducao.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/tools/consultarProducao.ts
import type { BlingClient } from "../bling/blingClient";
import { listarOrdensProducao } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface ProducaoDeps { client: BlingClient; hoje?: Date; }
export interface ProducaoArgs { periodo: Periodo; situacao?: "abertas" | "concluidas" | "todas"; dataInicial?: string; dataFinal?: string; }

export async function consultarProducao(deps: ProducaoDeps, args: ProducaoArgs) {
  const periodo = resolverPeriodo(args.periodo, deps.hoje ?? new Date(), args.dataInicial, args.dataFinal);
  let ordens = await listarOrdensProducao(deps.client, periodo);
  const sit = args.situacao ?? "todas";
  if (sit !== "todas") {
    const alvo = sit === "abertas" ? "aberta" : "concluida";
    ordens = ordens.filter((o) => String(o.situacao ?? "").toLowerCase().includes(alvo));
  }
  return {
    periodo, situacao: sit, numeroOrdens: ordens.length,
    quantidadeTotal: ordens.reduce((s, o) => s + (Number(o.quantidade) || 0), 0),
  };
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/consultarProducao.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/tools/consultarProducao.ts tests/consultarProducao.test.ts
git commit -m "feat: ferramenta consultar_producao"
```

---

### Task 12: Ferramenta gerar_relatorio_diario

**Files:**
- Create: `src/tools/relatorioDiario.ts`
- Test: `tests/relatorioDiario.test.ts`

Contrato: `gerarRelatorioDiario(deps, args)`, `deps = { client, hoje?, situacoesFaturado }`, `args = { data?: "hoje"|"ontem" }`. Reutiliza as ferramentas e devolve um objeto estruturado (o Claude o transforma em texto).

- [ ] **Step 1: Teste que falha**

```ts
// tests/relatorioDiario.test.ts
import { describe, it, expect } from "vitest";
import { gerarRelatorioDiario } from "../src/tools/relatorioDiario";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = {
  getAllPages: async (path: string) => {
    if (path === "/pedidos/vendas") return [{ total: 100 }];
    if (path === "/produtos") return [{ id: 1, nome: "Café", codigo: "C", estoque: { minimo: 10 } }];
    if (path === "/estoques/saldos") return [{ produto: { id: 1 }, saldoVirtualTotal: 2 }];
    if (path === "/ordens-producao") return [{ id: 1, quantidade: 30, situacao: "concluida" }];
    return [];
  },
} as any;

describe("gerarRelatorioDiario", () => {
  it("consolida vendas, faturamento, estoque crítico e produção", async () => {
    const r = await gerarRelatorioDiario({ client, hoje: REF, situacoesFaturado: [9] }, { data: "hoje" });
    expect(r.vendas.numeroPedidos).toBe(1);
    expect(r.estoqueCritico.total).toBe(1);
    expect(r.producao.quantidadeTotal).toBe(30);
    expect(r.data).toBe("2026-07-08");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/relatorioDiario.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/tools/relatorioDiario.ts
import type { BlingClient } from "../bling/blingClient";
import { consultarVendas } from "./consultarVendas";
import { consultarFaturamento } from "./consultarFaturamento";
import { consultarEstoque } from "./consultarEstoque";
import { consultarProducao } from "./consultarProducao";
import { resolverPeriodo } from "../util/periodo";

export interface RelatorioDeps { client: BlingClient; hoje?: Date; situacoesFaturado: number[]; }
export interface RelatorioArgs { data?: "hoje" | "ontem"; }

export async function gerarRelatorioDiario(deps: RelatorioDeps, args: RelatorioArgs) {
  const p = (args.data ?? "hoje") as "hoje" | "ontem";
  const hoje = deps.hoje ?? new Date();
  const { dataInicial } = resolverPeriodo(p, hoje);
  const [vendas, faturamento, estoqueCritico, producao] = await Promise.all([
    consultarVendas({ client: deps.client, hoje }, { periodo: p }),
    consultarFaturamento({ client: deps.client, hoje, situacoesFaturado: deps.situacoesFaturado }, { periodo: p }),
    consultarEstoque({ client: deps.client }, { filtro: "abaixo_minimo" }),
    consultarProducao({ client: deps.client, hoje }, { periodo: p, situacao: "todas" }),
  ]);
  return { data: dataInicial, vendas, faturamento, estoqueCritico, producao };
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/relatorioDiario.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/tools/relatorioDiario.ts tests/relatorioDiario.test.ts
git commit -m "feat: ferramenta gerar_relatorio_diario"
```

---

### Task 13: Registro de ferramentas e dispatcher

**Files:**
- Create: `src/agent/tools.ts`
- Test: `tests/tools.test.ts`

Contrato: exporta `toolDefinitions` (schema JSON no formato Anthropic) e `executarTool(nome, input, deps)` que roteia para a função certa. `deps = { client, situacoesFaturado, hoje? }`.

- [ ] **Step 1: Teste que falha**

```ts
// tests/tools.test.ts
import { describe, it, expect } from "vitest";
import { toolDefinitions, executarTool } from "../src/agent/tools";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = { getAllPages: async () => [{ total: 10 }] } as any;

describe("registro de ferramentas", () => {
  it("expõe as 5 ferramentas com nome e input_schema", () => {
    const nomes = toolDefinitions.map((t) => t.name).sort();
    expect(nomes).toEqual([
      "consultar_estoque", "consultar_faturamento", "consultar_producao", "consultar_vendas", "gerar_relatorio_diario",
    ]);
    for (const t of toolDefinitions) expect(t.input_schema.type).toBe("object");
  });
  it("dispatcher executa a ferramenta pelo nome", async () => {
    const r = await executarTool("consultar_vendas", { periodo: "hoje" }, { client, situacoesFaturado: [9], hoje: REF });
    expect((r as any).numeroPedidos).toBe(1);
  });
  it("erro em ferramenta desconhecida", async () => {
    await expect(executarTool("nao_existe", {}, { client, situacoesFaturado: [], hoje: REF }))
      .rejects.toThrow(/desconhecida/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/tools.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/agent/tools.ts
import type { BlingClient } from "../bling/blingClient";
import { consultarVendas } from "../tools/consultarVendas";
import { consultarFaturamento } from "../tools/consultarFaturamento";
import { consultarEstoque } from "../tools/consultarEstoque";
import { consultarProducao } from "../tools/consultarProducao";
import { gerarRelatorioDiario } from "../tools/relatorioDiario";

export interface ToolDeps { client: BlingClient; situacoesFaturado: number[]; hoje?: Date; }

const PERIODO_ENUM = ["hoje", "ontem", "esta_semana", "semana_passada", "este_mes", "mes_passado", "personalizado"];
const periodoProp = {
  periodo: { type: "string", enum: PERIODO_ENUM, description: "Janela de tempo. Use 'personalizado' com dataInicial/dataFinal (YYYY-MM-DD)." },
  dataInicial: { type: "string", description: "YYYY-MM-DD (só para personalizado)" },
  dataFinal: { type: "string", description: "YYYY-MM-DD (só para personalizado)" },
};

export const toolDefinitions = [
  { name: "consultar_vendas", description: "Total vendido, nº de pedidos e ticket médio num período.",
    input_schema: { type: "object", properties: periodoProp, required: ["periodo"] } },
  { name: "consultar_faturamento", description: "Faturamento (aprox. por pedidos faturados) num período, com comparação opcional.",
    input_schema: { type: "object", properties: { ...periodoProp, comparar_anterior: { type: "boolean" } }, required: ["periodo"] } },
  { name: "consultar_estoque", description: "Saldos de estoque; itens abaixo do mínimo ou busca por nome.",
    input_schema: { type: "object", properties: { filtro: { type: "string", enum: ["abaixo_minimo", "todos", "busca"] }, termo: { type: "string" } }, required: ["filtro"] } },
  { name: "consultar_producao", description: "Ordens de produção e quantidade produzida num período.",
    input_schema: { type: "object", properties: { ...periodoProp, situacao: { type: "string", enum: ["abertas", "concluidas", "todas"] } }, required: ["periodo"] } },
  { name: "gerar_relatorio_diario", description: "Resumo do dia: vendas, faturamento, estoque crítico e produção.",
    input_schema: { type: "object", properties: { data: { type: "string", enum: ["hoje", "ontem"] } } } },
] as const;

export async function executarTool(nome: string, input: any, deps: ToolDeps): Promise<unknown> {
  const base = { client: deps.client, hoje: deps.hoje };
  switch (nome) {
    case "consultar_vendas": return consultarVendas(base, input);
    case "consultar_faturamento": return consultarFaturamento({ ...base, situacoesFaturado: deps.situacoesFaturado }, input);
    case "consultar_estoque": return consultarEstoque({ client: deps.client }, input);
    case "consultar_producao": return consultarProducao(base, input);
    case "gerar_relatorio_diario": return gerarRelatorioDiario({ ...base, situacoesFaturado: deps.situacoesFaturado }, input);
    default: throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/tools.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/agent/tools.ts tests/tools.test.ts
git commit -m "feat: registro e dispatcher de ferramentas"
```

---

### Task 14: Prompt de sistema

**Files:**
- Create: `src/agent/systemPrompt.ts`
- Test: `tests/systemPrompt.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
// tests/systemPrompt.test.ts
import { describe, it, expect } from "vitest";
import { montarSystemPrompt } from "../src/agent/systemPrompt";

describe("montarSystemPrompt", () => {
  it("inclui a data atual e regras anti-alucinação", () => {
    const s = montarSystemPrompt(new Date("2026-07-08T12:00:00-03:00"));
    expect(s).toContain("2026-07-08");
    expect(s.toLowerCase()).toContain("não invente");
    expect(s.toLowerCase()).toContain("ferramentas");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/systemPrompt.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/agent/systemPrompt.ts
export function montarSystemPrompt(hoje: Date = new Date()): string {
  const dataSP = new Date(hoje.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  return [
    "Você é o assistente de gestão de uma empresa de café que usa o ERP Bling.",
    `Data de hoje (America/Sao_Paulo): ${dataSP}.`,
    "Responda SEMPRE em português do Brasil, de forma concisa e orientada à gestão.",
    "Use exclusivamente as ferramentas para obter números; NÃO invente dados nem estime sem fonte.",
    "Quando um valor for aproximado (ex.: faturamento por pedidos faturados, não NF-e), diga isso claramente.",
    "Se uma ferramenta retornar vazio, explique que não há dados no período.",
    "Formate valores em reais (R$) e use datas legíveis. Traga insights úteis, não só números.",
  ].join("\n");
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/systemPrompt.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/agent/systemPrompt.ts tests/systemPrompt.test.ts
git commit -m "feat: prompt de sistema do agente"
```

---

### Task 15: Loop do agente Claude (tool use + caching + guardrail)

**Files:**
- Create: `src/agent/claudeClient.ts`
- Test: `tests/claudeClient.test.ts`

Contrato: `runAgent({ anthropic, model, mensagens, deps, maxToolCalls=8, hoje? })` → `{ texto }`.
Executa loop: chama `anthropic.messages.create`; enquanto `stop_reason === "tool_use"`, executa as tools e devolve `tool_result`; encerra ao virar texto ou ao atingir o teto. Aplica `cache_control` no system + tools.

- [ ] **Step 1: Teste que falha** (Anthropic mockado que primeiro pede tool, depois responde texto)

```ts
// tests/claudeClient.test.ts
import { describe, it, expect } from "vitest";
import { runAgent } from "../src/agent/claudeClient";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = { getAllPages: async () => [{ total: 100 }] } as any;

function anthropicMock() {
  const seen: any[] = [];
  let call = 0;
  return {
    seen,
    messages: {
      create: async (body: any) => {
        seen.push(body);
        call++;
        if (call === 1) return {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", id: "t1", name: "consultar_vendas", input: { periodo: "hoje" } }],
        };
        return { stop_reason: "end_turn", content: [{ type: "text", text: "Você vendeu R$ 100 hoje." }] };
      },
    },
  };
}

describe("runAgent", () => {
  it("executa a ferramenta pedida e retorna o texto final", async () => {
    const anthropic = anthropicMock();
    const r = await runAgent({
      anthropic: anthropic as any, model: "claude-haiku-4-5",
      mensagens: [{ role: "user", content: "quanto vendi hoje?" }],
      deps: { client, situacoesFaturado: [9], hoje: REF }, hoje: REF,
    });
    expect(r.texto).toContain("R$ 100");
    // 2ª chamada deve conter o tool_result
    const segunda = anthropic.seen[1];
    const temToolResult = segunda.messages.some((m: any) =>
      Array.isArray(m.content) && m.content.some((c: any) => c.type === "tool_result"));
    expect(temToolResult).toBe(true);
  });

  it("respeita o teto de chamadas de ferramenta", async () => {
    let call = 0;
    const anthropic = { messages: { create: async () => { call++; return {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "x" + call, name: "consultar_vendas", input: { periodo: "hoje" } }],
    }; } } };
    const r = await runAgent({
      anthropic: anthropic as any, model: "m",
      mensagens: [{ role: "user", content: "loop" }],
      deps: { client, situacoesFaturado: [], hoje: REF }, maxToolCalls: 3, hoje: REF,
    });
    expect(call).toBeLessThanOrEqual(4); // 3 tool loops + no máximo 1 final
    expect(r.texto).toMatch(/limite|não consegui|tente/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/claudeClient.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/agent/claudeClient.ts
import { toolDefinitions, executarTool, type ToolDeps } from "./tools";
import { montarSystemPrompt } from "./systemPrompt";

export interface Mensagem { role: "user" | "assistant"; content: any; }
export interface RunAgentParams {
  anthropic: { messages: { create: (body: any) => Promise<any> } };
  model: string;
  mensagens: Mensagem[];
  deps: ToolDeps;
  maxToolCalls?: number;
  hoje?: Date;
}

export async function runAgent(p: RunAgentParams): Promise<{ texto: string }> {
  const maxToolCalls = p.maxToolCalls ?? 8;
  const system = [{ type: "text", text: montarSystemPrompt(p.hoje), cache_control: { type: "ephemeral" } }];
  const tools = toolDefinitions.map((t, i) =>
    i === toolDefinitions.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t);
  const messages: Mensagem[] = [...p.mensagens];

  for (let i = 0; i < maxToolCalls; i++) {
    const resp = await p.anthropic.messages.create({ model: p.model, max_tokens: 1024, system, tools, messages });
    if (resp.stop_reason !== "tool_use") return { texto: extrairTexto(resp) };

    messages.push({ role: "assistant", content: resp.content });
    const toolResults = [];
    for (const bloco of resp.content) {
      if (bloco.type !== "tool_use") continue;
      try {
        const resultado = await executarTool(bloco.name, bloco.input, p.deps);
        toolResults.push({ type: "tool_result", tool_use_id: bloco.id, content: JSON.stringify(resultado) });
      } catch (e) {
        toolResults.push({ type: "tool_result", tool_use_id: bloco.id, is_error: true, content: String(e) });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
  return { texto: "Não consegui concluir por atingir o limite de consultas. Tente refinar a pergunta." };
}

function extrairTexto(resp: any): string {
  return (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim()
    || "Sem resposta.";
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/claudeClient.test.ts` → Expected: PASS (2 testes).

- [ ] **Step 5: Commit**
```bash
git add src/agent/claudeClient.ts tests/claudeClient.test.ts
git commit -m "feat: loop do agente Claude com tool use e caching"
```

---

### Task 16: Servidor Express — login e sessão

**Files:**
- Create: `src/server.ts`
- Create: `src/auth.ts` (middleware)
- Test: `tests/auth.test.ts`

Contrato: cookie assinado `auth=1` (via `cookie-parser` com `SESSION_SECRET`). `POST /api/login {senha}` valida contra `APP_PASSWORD`. Middleware `exigirAuth` protege `/api/*` (exceto `/api/login` e `/api/bling/callback`).

- [ ] **Step 1: Teste que falha** (exporta `criarApp(cfg, deps)` para testar sem subir porta)

```ts
// tests/auth.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { criarApp } from "../src/server";

const cfg = { appPassword: "segredo", sessionSecret: "s", anthropicModel: "m", blingSituacaoFaturadoIds: [] } as any;
const app = criarApp(cfg, { runAgent: async () => ({ texto: "ok" }), blingClient: {} as any });

describe("auth", () => {
  it("rejeita /api/chat sem sessão", async () => {
    await request(app).post("/api/chat").send({ mensagens: [] }).expect(401);
  });
  it("login com senha errada falha", async () => {
    await request(app).post("/api/login").send({ senha: "x" }).expect(401);
  });
  it("login correto libera /api/chat", async () => {
    const agent = request.agent(app);
    await agent.post("/api/login").send({ senha: "segredo" }).expect(200);
    await agent.post("/api/chat").send({ mensagens: [{ role: "user", content: "oi" }] }).expect(200);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test tests/auth.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar `auth.ts` e `server.ts`** (o `server.ts` também será estendido na Task 17/18)

```ts
// src/auth.ts
import type { Request, Response, NextFunction } from "express";
export function exigirAuth(req: Request, res: Response, next: NextFunction) {
  if (req.signedCookies?.auth === "1") return next();
  res.status(401).json({ erro: "não autenticado" });
}
```

```ts
// src/server.ts
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { exigirAuth } from "./auth";
import type { AppConfig } from "./config";

export interface ServerDeps {
  runAgent: (args: any) => Promise<{ texto: string }>;
  blingClient: any;
}

export function criarApp(cfg: AppConfig, deps: ServerDeps): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(cfg.sessionSecret));

  app.post("/api/login", (req, res) => {
    if (req.body?.senha === cfg.appPassword) {
      res.cookie("auth", "1", { httpOnly: true, signed: true, sameSite: "lax", maxAge: 7 * 24 * 3600 * 1000 });
      return res.json({ ok: true });
    }
    res.status(401).json({ erro: "senha inválida" });
  });
  app.post("/api/logout", (_req, res) => { res.clearCookie("auth"); res.json({ ok: true }); });

  // /api/chat — implementada na Task 17
  app.post("/api/chat", exigirAuth, async (req, res) => {
    try {
      const mensagens = req.body?.mensagens ?? [];
      const { texto } = await deps.runAgent({ mensagens });
      res.json({ texto });
    } catch (e) {
      console.error("Erro em /api/chat:", e);
      res.status(500).json({ erro: "falha ao processar a mensagem" });
    }
  });

  // Estáticos do frontend (Task 18)
  const webDist = path.resolve("web/dist");
  app.use(express.static(webDist));
  app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));

  return app;
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test tests/auth.test.ts` → Expected: PASS (3 testes).

- [ ] **Step 5: Commit**
```bash
git add src/auth.ts src/server.ts tests/auth.test.ts
git commit -m "feat: servidor Express com login e sessão"
```

---

### Task 17: Fiação de /api/chat com o agente real + bootstrap

**Files:**
- Modify: `src/server.ts` (bootstrap no fim do arquivo, fora de `criarApp`)
- Create: `src/bootstrap.ts` (monta deps reais e sobe o servidor)

- [ ] **Step 1: Implementar `bootstrap.ts`**

```ts
// src/bootstrap.ts
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
    blingClient,
    runAgent: ({ mensagens }) => runAgent({
      anthropic, model: cfg.anthropicModel, mensagens,
      deps: { client: blingClient, situacoesFaturado: cfg.blingSituacaoFaturadoIds },
    }),
  });
  app.listen(cfg.port, () => console.log(`Agente Bling Café rodando em http://localhost:${cfg.port}`));
}
```

- [ ] **Step 2: Ligar o entrypoint** — no fim de `src/server.ts` adicionar:

```ts
// Sobe o servidor quando executado diretamente (não em testes)
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { iniciar } = await import("./bootstrap");
  iniciar();
}
```

- [ ] **Step 3: Verificar que os testes seguem passando** — Run: `npm test` → Expected: PASS (todos). *(O bloco de bootstrap não roda em testes.)*

- [ ] **Step 4: Smoke local (documentar):** com `.env` + `.bling-tokens.json` válidos, `npm run dev` e `curl` autenticado em `/api/chat`. Marcar pendente se ainda não houver token.

- [ ] **Step 5: Commit**
```bash
git add src/bootstrap.ts src/server.ts
git commit -m "feat: fiação do agente real em /api/chat"
```

---

### Task 18: Scaffold do frontend (Vite + React + Tailwind + shadcn)

> **OBRIGATÓRIO:** esta e as próximas tasks de UI seguem a skill `frontend-design`. Invoque-a antes de construir componentes.

**Files:**
- Create: app Vite em `web/`

- [ ] **Step 1: Criar app Vite**

Run: `npm create vite@latest web -- --template react-ts`
Run: `npm --prefix web install`

- [ ] **Step 2: Instalar e configurar Tailwind + shadcn**

Seguir o guia oficial shadcn para Vite: instalar `tailwindcss` + plugin, configurar `tailwind.config`, `components.json`, path alias `@`. 
Run (exemplos): `npm --prefix web install -D tailwindcss @tailwindcss/vite` e `npx --prefix web shadcn@latest init`.
Adicionar proxy de dev no `web/vite.config.ts` para `/api` → `http://localhost:3000`, e `build.outDir` padrão (`web/dist`).

- [ ] **Step 3: Adicionar componentes shadcn base**

Run: `npx --prefix web shadcn@latest add button input card scroll-area textarea`

- [ ] **Step 4: Verificar build** — Run: `npm --prefix web run build` → Expected: gera `web/dist/`.

- [ ] **Step 5: Commit**
```bash
git add web -A
git commit -m "chore: scaffold do frontend (vite+react+tailwind+shadcn)"
```

---

### Task 19: Tela de login (shadcn + frontend-design)

> **OBRIGATÓRIO:** invoque a skill `frontend-design`. Use componentes shadcn (`Card`, `Input`, `Button`). Nada de CSS/HTML genérico.

**Files:**
- Create: `web/src/components/Login.tsx`
- Create/Modify: `web/src/lib/api.ts` (helpers de fetch)

**Requisitos funcionais (o design/estética fica a cargo da skill):**
- Formulário com um campo de senha e botão "Entrar".
- `POST /api/login { senha }`; em 200 → chama `onLogin()`; em 401 → mostra erro "senha inválida".
- Estado de carregando no botão; identidade visual condizente com marca de café (tom acolhedor, sóbrio).
- `api.ts` expõe `login(senha)` e `enviarChat(mensagens)` usando `fetch` com `credentials: "include"`.

- [ ] **Step 1:** Invocar skill `frontend-design`; implementar `Login.tsx` + `api.ts` conforme requisitos.
- [ ] **Step 2:** Rodar `npm --prefix web run build` → Expected: build ok.
- [ ] **Step 3:** Commit
```bash
git add web/src -A
git commit -m "feat: tela de login (shadcn)"
```

---

### Task 20: UI de chat (shadcn + frontend-design)

> **OBRIGATÓRIO:** invoque a skill `frontend-design`. Use shadcn. Interface polida e distinta.

**Files:**
- Create: `web/src/components/Chat.tsx`
- Modify: `web/src/App.tsx` (alterna Login/Chat conforme sessão)

**Requisitos funcionais:**
- Lista de mensagens (usuário à direita, agente à esquerda), auto-scroll ao fim.
- Campo de entrada (`Textarea`) + botão enviar; Enter envia, Shift+Enter quebra linha.
- Botão/atalho **"Relatório de hoje"** que envia a mensagem "Gere o relatório de hoje".
- Indicador de "pensando…" enquanto aguarda resposta.
- **Histórico no cliente:** mantém array `mensagens` (formato `{role, content}`) e reenvia em cada `POST /api/chat`. Anexa `{role:"assistant", content: texto}` ao receber.
- Erro de rede → bolha de erro amigável, sem quebrar o histórico.
- App.tsx: se `POST /api/chat` responder 401, volta para `Login`.

- [ ] **Step 1:** Invocar `frontend-design`; implementar `Chat.tsx` + integrar em `App.tsx`.
- [ ] **Step 2:** `npm --prefix web run build` → Expected: ok.
- [ ] **Step 3:** Commit
```bash
git add web/src -A
git commit -m "feat: UI de chat (shadcn)"
```

---

### Task 21: Integração ponta-a-ponta e README

**Files:**
- Create: `README.md`
- Verify: fluxo completo servido pelo backend

- [ ] **Step 1: `README.md`** com: pré-requisitos (Node ≥20, app Bling criado, `ANTHROPIC_API_KEY`), passos: `cp .env.example .env` e preencher; `npm install`; `npm run bling:auth` (uma vez); `npm --prefix web install && npm --prefix web run build`; `npm start`; abrir `http://localhost:3000`, logar e conversar. Incluir seção "descobrir os IDs de situação faturada" e nota sobre `.bling-tokens.json` (não versionar).

- [ ] **Step 2: Suite completa** — Run: `npm test` → Expected: TODOS os testes passam.

- [ ] **Step 3: Smoke manual read-only (com credenciais reais):** logar no site, perguntar "quanto vendi hoje?", "o que está abaixo do mínimo no estoque?", "gere o relatório de hoje" e conferir que os números batem com o Bling. Registrar resultado. *(Se ainda sem credenciais/token, marcar como pendente para o usuário executar.)*

- [ ] **Step 4: Commit**
```bash
git add README.md
git commit -m "docs: README de setup e execução"
```

---

## Self-Review (preenchido pelo autor do plano)

- **Cobertura da spec:** §2 escopo → Tasks 8–12; §3 auth → Task 16; §4 arquitetura/fluxo → Tasks 15–17; §5 ferramentas → Tasks 8–13; §6 Bling (OAuth/token/throttle/paginação) → Tasks 4,5,6,7; §7 Claude (modelo/caching/guardrail) → Tasks 14,15; §8 frontend (shadcn+skill) → Tasks 18–20; §9 segurança → Tasks 1,16; §10 erros → Tasks 6,15,16; §11 estrutura → todas; §12 testes → embutidos; §13 riscos → marcados como ⚠️ VERIFICAÇÃO nas Tasks 5,7,10,11.
- **Placeholders:** nenhum "TBD/TODO"; itens de verificação são ações concretas contra a doc do Bling.
- **Consistência de tipos:** `BlingClient.getAllPages/get`, `resolverPeriodo(periodo,hoje,di,df)`, `executarTool(nome,input,deps)`, `runAgent({anthropic,model,mensagens,deps,...})`, `criarApp(cfg,deps)` usados de forma idêntica entre tasks. Ferramentas retornam objetos serializados via `JSON.stringify` no loop do agente.
- **Nota de escopo:** frontend depende do backend, mas o backend é testável isoladamente (Tasks 1–17 entregam API funcional). Ordem preserva "software funcional" a cada fase.
