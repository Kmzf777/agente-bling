# OpenBling — Agente Autônomo de Gestão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **REGRA DE UI:** Qualquer task que altere `web/` DEVE usar o skill `frontend-design` (regra permanente do produto). Marcadas com 🎨.

**Goal:** Transformar o chatbot Bling de 9 tools rígidas num agente autônomo de gestão ("opencode para gestão") com cobertura fiscal (NF-e/CFOP) e financeira (pago/aberto), modelo Claude Sonnet e loop multi-step com streaming.

**Architecture:** Purpose-built que espelha o paradigma do opencode (Session/Agent/Tool/Provider/Permission), sobre Vercel AI SDK (`ai` + `@ai-sdk/anthropic`). Backend Express mantido; miolo do agente reescrito. Read-only enforced. Frontend React+shadcn mantido, com timeline de tool-calls.

**Tech Stack:** Node 20 + TypeScript, Express, Vercel AI SDK v5, `@ai-sdk/anthropic`, zod, Vitest, React+Vite+Tailwind+shadcn.

**Spec:** `docs/superpowers/specs/2026-07-15-openbling-agente-autonomo-design.md`

---

## Notas para todos os executores

- **TDD sempre:** teste falha → implementação mínima → teste passa → commit.
- **Confirme a API do AI SDK instalado:** este plano mira **AI SDK v5** (`tool({ inputSchema })`, `stopWhen: stepCountIs()`, `result.fullStream`). Se a versão instalada divergir, ajuste conforme a doc do pacote (`node_modules/ai/README` ou https://sdk.vercel.ai/docs). Não invente API.
- **Confirme params reais da API v3 do Bling** (NF-e, contas) contra https://developer.bling.com.br/referencia quando o teste exigir dado real; a camada `endpoints.ts` isola isso.
- **Rode a suíte** com `npm test` e o typecheck com `npm run typecheck` ao fim de cada task.
- **Branch:** todo o trabalho ocorre na branch de feature criada no handoff (não na `main`).

---

## File Structure

**Criar:**
- `src/agent/provider.ts` — factory de modelo (AI SDK, provider-agnostic)
- `src/bling/readOnlyGuard.ts` — whitelist de paths de leitura + bloqueio de verbo de escrita
- `src/tools/consultarNotasFiscais.ts` — tool de NF-e (CFOP/bonificação)
- `src/tools/consultarApi.ts` — escape hatch genérico `bling_consultar_api`
- `tests/provider.test.ts`, `tests/readOnlyGuard.test.ts`, `tests/consultarNotasFiscais.test.ts`, `tests/consultarApi.test.ts`

**Modificar:**
- `package.json`, `.env.example`, `src/config.ts`
- `src/bling/blingClient.ts` (paginação honesta), `src/bling/endpoints.ts` (NF-e + contas com filtros)
- `src/tools/consultarFinanceiro.ts` (situação pago/aberto), demais `src/tools/*` (retornos ricos)
- `src/agent/tools.ts` (tools AI SDK), `src/agent/agentLoop.ts` (streamText multi-step), `src/agent/systemPrompt.ts`, `src/agent/conhecimento.md`
- `src/server.ts` (endpoint SSE), `web/src/lib/api.ts` 🎨, `web/src/components/Chat.tsx` 🎨

---

## Task 1: Dependências + config de provider/modelo

**Files:**
- Modify: `package.json`, `.env.example`, `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Instalar dependências**

Run:
```bash
npm install ai@^5 @ai-sdk/anthropic@^2 zod@^3
```
Expected: pacotes adicionados a `dependencies`. Se as majors diverterem no registry, instale a última estável e anote a versão no topo do plano.

- [ ] **Step 2: Escrever teste falhando para nova config**

Em `tests/config.test.ts`, adicionar:
```ts
it("carrega provider/modelo do agente com defaults", () => {
  const cfg = loadConfig({ ...baseEnv, ANTHROPIC_API_KEY: "sk-ant-x" });
  expect(cfg.agentProvider).toBe("anthropic");
  expect(cfg.agentModel).toBe("claude-sonnet-4-6");
  expect(cfg.anthropicApiKey).toBe("sk-ant-x");
});
it("respeita overrides de provider/modelo", () => {
  const cfg = loadConfig({ ...baseEnv, ANTHROPIC_API_KEY: "k", AGENT_PROVIDER: "anthropic", AGENT_MODEL: "claude-opus-4-8" });
  expect(cfg.agentModel).toBe("claude-opus-4-8");
});
```
(`baseEnv` = objeto com as vars REQUIRED atuais; reutilize o helper existente no arquivo de teste.)

- [ ] **Step 3: Rodar teste (deve falhar)**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL (`agentProvider` undefined).

- [ ] **Step 4: Implementar config**

Em `src/config.ts`, adicionar ao `AppConfig` e ao retorno de `loadConfig`:
```ts
// no interface AppConfig:
agentProvider: "anthropic";
agentModel: string;
anthropicApiKey: string;
agentMaxSteps: number;
// no return de loadConfig:
agentProvider: "anthropic",
agentModel: env.AGENT_MODEL || "claude-sonnet-4-6",
anthropicApiKey: env.ANTHROPIC_API_KEY || "",
agentMaxSteps: Number(env.AGENT_MAX_STEPS || 20),
```
Adicionar `ANTHROPIC_API_KEY` à lista `REQUIRED` **somente** se `AGENT_PROVIDER !== "openai"`; para não quebrar testes existentes, mantenha `OPENAI_API_KEY` opcional agora (remova de REQUIRED) e valide que existe pelo menos uma chave do provider ativo.

- [ ] **Step 5: Atualizar `.env.example`**

Adicionar:
```
# Provider do agente (default anthropic)
AGENT_PROVIDER=anthropic
AGENT_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=
AGENT_MAX_STEPS=20
```

- [ ] **Step 6: Rodar teste (deve passar) + typecheck**

Run: `npx vitest run tests/config.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.example src/config.ts tests/config.test.ts
git commit -m "feat: config de provider/modelo do agente (AI SDK + Anthropic)"
```

---

## Task 2: Provider layer (factory de modelo)

**Files:**
- Create: `src/agent/provider.ts`, `tests/provider.test.ts`

- [ ] **Step 1: Teste falhando**

`tests/provider.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { criarModelo } from "../src/agent/provider";

describe("provider", () => {
  it("cria um modelo anthropic sem lançar", () => {
    const m = criarModelo({ agentProvider: "anthropic", agentModel: "claude-sonnet-4-6", anthropicApiKey: "sk-ant-test" } as any);
    expect(m).toBeTruthy();
  });
  it("lança se faltar chave do provider ativo", () => {
    expect(() => criarModelo({ agentProvider: "anthropic", agentModel: "x", anthropicApiKey: "" } as any)).toThrow();
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)** — Run: `npx vitest run tests/provider.test.ts` — Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/agent/provider.ts`:
```ts
import { createAnthropic } from "@ai-sdk/anthropic";
import type { AppConfig } from "../config";

export function criarModelo(cfg: Pick<AppConfig, "agentProvider" | "agentModel" | "anthropicApiKey">) {
  if (cfg.agentProvider === "anthropic") {
    if (!cfg.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY ausente para provider anthropic");
    const anthropic = createAnthropic({ apiKey: cfg.anthropicApiKey });
    return anthropic(cfg.agentModel);
  }
  throw new Error(`Provider não suportado: ${cfg.agentProvider}`);
}
```
(OpenAI fica como extensão futura — YAGNI.)

- [ ] **Step 4: Rodar (deve passar)** — Run: `npx vitest run tests/provider.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/agent/provider.ts tests/provider.test.ts
git commit -m "feat: provider layer do agente (Anthropic via AI SDK)"
```

---

## Task 3: Paginação honesta no BlingClient (sinaliza truncado)

**Files:**
- Modify: `src/bling/blingClient.ts`, `src/bling/endpoints.ts` e call sites das tools
- Test: `tests/blingClient.test.ts`

- [ ] **Step 1: Teste falhando**

Em `tests/blingClient.test.ts`, adicionar (usando o `fetchImpl` mockado já existente no arquivo):
```ts
it("getAllPages sinaliza truncado quando bate maxPaginas", async () => {
  const page = { data: Array.from({ length: 100 }, (_, i) => ({ id: i })) };
  const client = new BlingClient({ tokenManager: fakeTM(), fetchImpl: async () => okJson(page), minIntervalMs: 0 });
  const r = await client.getAllPages("/x", {}, { limite: 100, maxPaginas: 2 });
  expect(r.itens).toHaveLength(200);
  expect(r.truncado).toBe(true);
});
it("getAllPages não trunca quando a última página é parcial", async () => {
  let n = 0;
  const client = new BlingClient({ tokenManager: fakeTM(), fetchImpl: async () => okJson({ data: (n++ === 0 ? Array.from({ length: 100 }, (_, i) => ({ id: i })) : [{ id: 999 }]) }), minIntervalMs: 0 });
  const r = await client.getAllPages("/x", {}, { limite: 100, maxPaginas: 5 });
  expect(r.truncado).toBe(false);
});
```
(Reutilize/defina helpers `fakeTM`, `okJson` no topo do arquivo de teste, seguindo o mock já usado.)

- [ ] **Step 2: Rodar (deve falhar)** — `npx vitest run tests/blingClient.test.ts` — FAIL (retorno é array, não `{itens,truncado}`).

- [ ] **Step 3: Implementar em `blingClient.ts`**

Trocar a assinatura de `getAllPages`:
```ts
async getAllPages<T = any>(path: string, query: Record<string, unknown> = {},
  { limite = 100, maxPaginas = 50 } = {}): Promise<{ itens: T[]; truncado: boolean }> {
  const itens: T[] = [];
  let truncado = false;
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const resp = await this.get<{ data: T[] }>(path, { ...query, pagina, limite });
    const data = resp.data ?? [];
    itens.push(...data);
    if (data.length < limite) return { itens, truncado: false };
    if (pagina === maxPaginas) truncado = true;
  }
  return { itens, truncado };
}
```

- [ ] **Step 4: Atualizar `endpoints.ts` para o novo shape**

Cada função de lista retorna `{ itens, truncado }`. Ex.:
```ts
export async function listarPedidosVenda(c: BlingClient, f: FiltroData) {
  const query: Record<string, unknown> = { dataInicial: f.dataInicial, dataFinal: f.dataFinal };
  if (f.situacoes?.length) query["idsSituacoes[]"] = f.situacoes;
  return c.getAllPages<any>("/pedidos/vendas", query);
}
```
Aplicar o mesmo a `listarProdutos`, `listarOrdensProducao`, `listarContatos`, `listarContasReceber`, `listarContasPagar` (todas passam a devolver `{itens,truncado}`).

- [ ] **Step 5: Bridge nos call sites atuais (manter build verde)**

Em cada tool que hoje faz `const x = await listarX(...)`, trocar para `const { itens: x, truncado } = await listarX(...)` e usar `x`. Arquivos: `src/tools/consultarVendas.ts`, `consultarFaturamento.ts`, `consultarProducao.ts`, `consultarClientes.ts`, `consultarCatalogo.ts`, `consultarFinanceiro.ts`, `consultarPedidos.ts`, `relatorioDiario.ts`. (Serão refinadas nas tasks seguintes; aqui só o destructure para compilar.)

- [ ] **Step 6: Rodar suíte + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS (ajuste testes de endpoints que esperavam array para esperar `.itens`).

- [ ] **Step 7: Commit**
```bash
git add src/bling/blingClient.ts src/bling/endpoints.ts src/tools tests
git commit -m "feat: paginação honesta (sinaliza truncado) e propaga aos endpoints"
```

---

## Task 4: Endpoints de NF-e

**Files:**
- Modify: `src/bling/endpoints.ts`
- Test: `tests/endpoints.test.ts`

- [ ] **Step 1: Teste falhando**

Em `tests/endpoints.test.ts`:
```ts
it("listarNotasFiscais envia dataEmissao e paginação", async () => {
  const calls: string[] = [];
  const client = { getAllPages: async (p: string, q: any) => { calls.push(p + "?" + new URLSearchParams(q as any)); return { itens: [{ id: 1 }], truncado: false }; } } as any;
  const r = await listarNotasFiscais(client, { dataInicial: "2026-06-01", dataFinal: "2026-06-30" });
  expect(r.itens).toHaveLength(1);
  expect(calls[0]).toContain("/nfe");
});
```

- [ ] **Step 2: Rodar (deve falhar)** — `npx vitest run tests/endpoints.test.ts` — FAIL (`listarNotasFiscais` não existe).

- [ ] **Step 3: Implementar em `endpoints.ts`**
```ts
export interface FiltroNfe { dataInicial: string; dataFinal: string; tipo?: number; situacoes?: number[]; }
export async function listarNotasFiscais(c: BlingClient, f: FiltroNfe) {
  const query: Record<string, unknown> = { dataEmissaoInicial: f.dataInicial, dataEmissaoFinal: f.dataFinal };
  if (f.tipo !== undefined) query["tipo"] = f.tipo;
  if (f.situacoes?.length) query["situacoes[]"] = f.situacoes;
  return c.getAllPages<any>("/nfe", query);
}
export async function obterNotaFiscal(c: BlingClient, id: number): Promise<any> {
  return c.get(`/nfe/${id}`);
}
```
> **Nota de execução:** confirmar contra developer.bling.com.br/referencia se os params de data em `/nfe` são `dataEmissaoInicial/Final` (padrão v3). Ajustar se necessário; o teste acima só verifica o path `/nfe` e a passagem de params.

- [ ] **Step 4: Rodar (deve passar)** — `npx vitest run tests/endpoints.test.ts` — PASS.

- [ ] **Step 5: Commit**
```bash
git add src/bling/endpoints.ts tests/endpoints.test.ts
git commit -m "feat: endpoints de NF-e (listar/obter)"
```

---

## Task 5: Financeiro com filtro de situação (pago/aberto) — endpoints

**Files:**
- Modify: `src/bling/endpoints.ts`
- Test: `tests/endpoints.test.ts`

- [ ] **Step 1: Teste falhando**
```ts
it("listarContasPagar envia situacoes[] e datas de vencimento", async () => {
  const calls: any[] = [];
  const client = { getAllPages: async (p: string, q: any) => { calls.push({ p, q }); return { itens: [], truncado: false }; } } as any;
  await listarContasPagar(client, { dataInicial: "2026-06-01", dataFinal: "2026-06-30", situacoes: [1] });
  expect(calls[0].p).toBe("/contas/pagar");
  expect(calls[0].q["situacoes[]"]).toEqual([1]);
  expect(calls[0].q.dataVencimentoInicial).toBe("2026-06-01");
});
```

- [ ] **Step 2: Rodar (deve falhar)** — FAIL (assinatura atual não recebe filtro).

- [ ] **Step 3: Implementar** — trocar `listarContasPagar`/`listarContasReceber` para aceitar filtro:
```ts
export interface FiltroConta { dataInicial?: string; dataFinal?: string; situacoes?: number[]; }
function queryContas(f: FiltroConta) {
  const q: Record<string, unknown> = {};
  if (f.dataInicial) q["dataVencimentoInicial"] = f.dataInicial;
  if (f.dataFinal) q["dataVencimentoFinal"] = f.dataFinal;
  if (f.situacoes?.length) q["situacoes[]"] = f.situacoes;
  return q;
}
export async function listarContasPagar(c: BlingClient, f: FiltroConta = {}) { return c.getAllPages<any>("/contas/pagar", queryContas(f)); }
export async function listarContasReceber(c: BlingClient, f: FiltroConta = {}) { return c.getAllPages<any>("/contas/receber", queryContas(f)); }
```
> **Nota:** confirmar os códigos de `situacoes` (ex.: 1=em aberto, 2=pago/recebido, 3=parcial, 4=cancelado) e nomes de params contra a referência v3.

- [ ] **Step 4: Rodar (deve passar)** — PASS.

- [ ] **Step 5: Commit**
```bash
git add src/bling/endpoints.ts tests/endpoints.test.ts
git commit -m "feat: contas a pagar/receber com filtro de situacao e vencimento (server-side)"
```

---

## Task 6: Read-only guard

**Files:**
- Create: `src/bling/readOnlyGuard.ts`, `tests/readOnlyGuard.test.ts`

- [ ] **Step 1: Teste falhando**
```ts
import { describe, it, expect } from "vitest";
import { validarPathLeitura } from "../src/bling/readOnlyGuard";

describe("readOnlyGuard", () => {
  it("aceita paths de leitura conhecidos", () => {
    expect(validarPathLeitura("/nfe")).toBe(true);
    expect(validarPathLeitura("/contas/pagar")).toBe(true);
    expect(validarPathLeitura("/pedidos/vendas/123")).toBe(true);
  });
  it("rejeita paths desconhecidos ou suspeitos", () => {
    expect(validarPathLeitura("/qualquer/coisa")).toBe(false);
    expect(validarPathLeitura("../secret")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)** — FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/bling/readOnlyGuard.ts`:
```ts
// Prefixos de recursos de LEITURA permitidos na API v3 (agente é read-only).
const PREFIXOS_LEITURA = [
  "/pedidos/vendas", "/produtos", "/estoques/saldos", "/ordens-producao",
  "/contatos", "/contas/pagar", "/contas/receber", "/nfe",
  "/categorias", "/situacoes", "/formas-pagamentos", "/depositos",
];
export function validarPathLeitura(path: string): boolean {
  if (!path.startsWith("/") || path.includes("..")) return false;
  const limpo = path.split("?")[0];
  return PREFIXOS_LEITURA.some((p) => limpo === p || limpo.startsWith(p + "/"));
}
```

- [ ] **Step 4: Rodar (deve passar)** — PASS.

- [ ] **Step 5: Commit**
```bash
git add src/bling/readOnlyGuard.ts tests/readOnlyGuard.test.ts
git commit -m "feat: read-only guard (whitelist de paths de leitura)"
```

---

## Task 7: Tool `consultar_notas_fiscais` (CFOP / bonificação) — destrava print 3

**Files:**
- Create: `src/tools/consultarNotasFiscais.ts`, `tests/consultarNotasFiscais.test.ts`

- [ ] **Step 1: Teste falhando**
```ts
import { describe, it, expect } from "vitest";
import { consultarNotasFiscais } from "../src/tools/consultarNotasFiscais";

const nf = (itens: any[]) => ({ id: 1, numero: "1", tipo: 1, dataEmissao: "2026-06-10", naturezaOperacao: "Venda", itens });

describe("consultarNotasFiscais", () => {
  it("agrupa itens por CFOP e sinaliza bonificação", async () => {
    const client: any = { getAllPages: async () => ({ itens: [
      nf([{ descricao: "Café A", cfop: "5102", valor: 100, quantidade: 2 }]),
      nf([{ descricao: "Brinde", cfop: "5910", valor: 0, quantidade: 1 }]),
    ], truncado: false }) };
    const r: any = await consultarNotasFiscais({ client }, { periodo: "mes_passado" }, new Date("2026-07-15"));
    const cfops = r.porCfop.map((c: any) => c.cfop);
    expect(cfops).toContain("5102");
    expect(cfops).toContain("5910");
    const bonif = r.porCfop.find((c: any) => c.cfop === "5910");
    expect(bonif.bonificacao).toBe(true); // 5910 = bonificação/brinde
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)** — FAIL.

- [ ] **Step 3: Implementar**

`src/tools/consultarNotasFiscais.ts`:
```ts
import type { BlingClient } from "../bling/blingClient";
import { listarNotasFiscais } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface NfDeps { client: BlingClient; }
export interface NfArgs { periodo: Periodo; dataInicial?: string; dataFinal?: string; tipo?: number; }

// CFOPs de bonificação/brinde/amostra mais comuns (saída). Referência geral; ajuste conforme a operação.
const CFOP_BONIFICACAO = new Set(["5910", "6910", "5911", "6911"]);

export async function consultarNotasFiscais(deps: NfDeps, args: NfArgs, hoje: Date = new Date()) {
  const p = resolverPeriodo(args.periodo, hoje, args.dataInicial, args.dataFinal);
  const { itens: notas, truncado } = await listarNotasFiscais(deps.client, { dataInicial: p.dataInicial, dataFinal: p.dataFinal, tipo: args.tipo });
  const agrupado = new Map<string, { cfop: string; bonificacao: boolean; valor: number; quantidade: number; itens: number }>();
  for (const nf of notas) for (const it of (nf.itens ?? [])) {
    const cfop = String(it.cfop ?? "sem-cfop");
    const cur = agrupado.get(cfop) ?? { cfop, bonificacao: CFOP_BONIFICACAO.has(cfop), valor: 0, quantidade: 0, itens: 0 };
    cur.valor += Number(it.valor) || 0; cur.quantidade += Number(it.quantidade) || 0; cur.itens += 1;
    agrupado.set(cfop, cur);
  }
  const porCfop = [...agrupado.values()].sort((a, b) => b.valor - a.valor);
  return {
    periodo: p, totalNotas: notas.length, porCfop,
    totalVenda: porCfop.filter((c) => !c.bonificacao).reduce((s, c) => s + c.valor, 0),
    totalBonificacao: porCfop.filter((c) => c.bonificacao).reduce((s, c) => s + c.valor, 0),
    paginacao: { truncado }, observacao: "CFOP por item da NF-e; bonificação identificada por CFOP (5910/6910/…).",
  };
}
```

- [ ] **Step 4: Rodar (deve passar)** — PASS.

- [ ] **Step 5: Commit**
```bash
git add src/tools/consultarNotasFiscais.ts tests/consultarNotasFiscais.test.ts
git commit -m "feat: tool consultar_notas_fiscais (CFOP e bonificacao)"
```

---

## Task 8: Reescrever `consultarFinanceiro` (pago/aberto) — destrava print 4

**Files:**
- Modify: `src/tools/consultarFinanceiro.ts`
- Test: `tests/consultarFinanceiro.test.ts`

- [ ] **Step 1: Teste falhando**
```ts
it("separa pago x em aberto por situacao", async () => {
  const contas = [
    { valor: 100, vencimento: "2026-06-10", situacao: 2, contato: { nome: "A" } }, // pago
    { valor: 50, vencimento: "2026-06-20", situacao: 1, contato: { nome: "B" } },  // aberto
  ];
  const client: any = { getAllPages: async () => ({ itens: contas, truncado: false }) };
  const r: any = await consultarFinanceiro({ client }, { tipo: "a_pagar", periodo: "mes_passado" }, new Date("2026-07-15"));
  expect(r.totalPago).toBe(100);
  expect(r.totalEmAberto).toBe(50);
});
```

- [ ] **Step 2: Rodar (deve falhar)** — FAIL (não há `totalPago`).

- [ ] **Step 3: Implementar** — substituir o corpo por versão com situação:
```ts
import type { BlingClient } from "../bling/blingClient";
import { listarContasReceber, listarContasPagar } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface FinanceiroDeps { client: BlingClient; hoje?: Date; }
export interface FinanceiroArgs { tipo: "a_receber" | "a_pagar"; periodo?: Periodo; dataInicial?: string; dataFinal?: string; }

const PAGO = new Set([2]); // 2 = pago/recebido (confirmar); demais = em aberto/parcial
export async function consultarFinanceiro(deps: FinanceiroDeps, args: FinanceiroArgs, hoje: Date = deps.hoje ?? new Date()) {
  const p = args.periodo ? resolverPeriodo(args.periodo, hoje, args.dataInicial, args.dataFinal) : undefined;
  const filtro = p ? { dataInicial: p.dataInicial, dataFinal: p.dataFinal } : {};
  const { itens: contas, truncado } = args.tipo === "a_receber"
    ? await listarContasReceber(deps.client, filtro)
    : await listarContasPagar(deps.client, filtro);
  const val = (c: any) => Number(c.valor) || 0;
  const pago = contas.filter((c: any) => PAGO.has(Number(c.situacao)));
  const aberto = contas.filter((c: any) => !PAGO.has(Number(c.situacao)));
  return {
    tipo: args.tipo, periodo: p,
    total: Math.round(contas.reduce((s: number, c: any) => s + val(c), 0) * 100) / 100,
    totalPago: Math.round(pago.reduce((s: number, c: any) => s + val(c), 0) * 100) / 100,
    totalEmAberto: Math.round(aberto.reduce((s: number, c: any) => s + val(c), 0) * 100) / 100,
    quantidade: contas.length, quantidadePago: pago.length, quantidadeEmAberto: aberto.length,
    paginacao: { truncado },
    itens: contas.slice(0, 20).map((c: any) => ({ valor: val(c), vencimento: c.vencimento, situacao: c.situacao, contato: c.contato?.nome ?? null })),
  };
}
```
> **Nota:** confirmar o campo de situação nas contas v3 (`situacao` numérico) e o código de "pago". Ajustar `PAGO` conforme a referência.

- [ ] **Step 4: Rodar (deve passar) + suíte** — `npm test` — PASS (adaptar o teste antigo de financeiro que checava a observação hardcoded).

- [ ] **Step 5: Commit**
```bash
git add src/tools/consultarFinanceiro.ts tests/consultarFinanceiro.test.ts
git commit -m "feat: financeiro distingue pago x em aberto por situacao"
```

---

## Task 9: Escape hatch `bling_consultar_api` (guarded)

**Files:**
- Create: `src/tools/consultarApi.ts`, `tests/consultarApi.test.ts`

- [ ] **Step 1: Teste falhando**
```ts
import { describe, it, expect } from "vitest";
import { consultarApi } from "../src/tools/consultarApi";

describe("consultarApi", () => {
  it("rejeita path fora da whitelist", async () => {
    const client: any = { get: async () => ({}), getAllPages: async () => ({ itens: [], truncado: false }) };
    await expect(consultarApi({ client }, { path: "/usuarios" })).rejects.toThrow(/leitura/i);
  });
  it("consulta path permitido e devolve dados", async () => {
    const client: any = { getAllPages: async () => ({ itens: [{ id: 1 }], truncado: false }) };
    const r: any = await consultarApi({ client }, { path: "/nfe", todasPaginas: true });
    expect(r.dados).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)** — FAIL.

- [ ] **Step 3: Implementar**

`src/tools/consultarApi.ts`:
```ts
import type { BlingClient } from "../bling/blingClient";
import { validarPathLeitura } from "../bling/readOnlyGuard";

export interface ConsultarApiDeps { client: BlingClient; }
export interface ConsultarApiArgs { path: string; params?: Record<string, string | number | Array<string | number>>; todasPaginas?: boolean; maxPaginas?: number; }

export async function consultarApi(deps: ConsultarApiDeps, args: ConsultarApiArgs) {
  if (!validarPathLeitura(args.path)) throw new Error(`Path não permitido (somente leitura): ${args.path}`);
  if (args.todasPaginas) {
    const { itens, truncado } = await deps.client.getAllPages<any>(args.path, args.params ?? {}, { maxPaginas: args.maxPaginas ?? 20 });
    return { dados: itens, paginacao: { truncado } };
  }
  const resp = await deps.client.get<any>(args.path, args.params ?? {});
  return { dados: resp?.data ?? resp };
}
```

- [ ] **Step 4: Rodar (deve passar)** — PASS.

- [ ] **Step 5: Commit**
```bash
git add src/tools/consultarApi.ts tests/consultarApi.test.ts
git commit -m "feat: escape hatch bling_consultar_api (guarded read-only)"
```

---

## Task 10: Registrar tools no formato AI SDK (tier1 + tier2)

**Files:**
- Modify: `src/agent/tools.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Teste falhando**
```ts
import { describe, it, expect } from "vitest";
import { construirTools } from "../src/agent/tools";

describe("construirTools", () => {
  it("expõe as tools típadas + a genérica", () => {
    const tools = construirTools({ client: {} as any, situacoesFaturado: [], hoje: new Date() });
    const nomes = Object.keys(tools);
    expect(nomes).toContain("consultar_notas_fiscais");
    expect(nomes).toContain("consultar_financeiro");
    expect(nomes).toContain("bling_consultar_api");
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)** — FAIL (`construirTools` não existe / formato antigo).

- [ ] **Step 3: Implementar** — reescrever `tools.ts` para exportar `construirTools(deps)` retornando um mapa de tools do AI SDK (`tool({ description, inputSchema, execute })`). Exemplo do padrão (repetir para cada tool, incluindo as existentes adaptadas):
```ts
import { tool } from "ai";
import { z } from "zod";
import type { BlingClient } from "../bling/blingClient";
import { consultarNotasFiscais } from "../tools/consultarNotasFiscais";
import { consultarFinanceiro } from "../tools/consultarFinanceiro";
import { consultarApi } from "../tools/consultarApi";
// ...demais imports de tools existentes

export interface ToolDeps { client: BlingClient; situacoesFaturado: number[]; hoje?: Date; }
const periodo = z.enum(["hoje","ontem","esta_semana","semana_passada","este_mes","mes_passado","personalizado"]);
const periodoArgs = { periodo, dataInicial: z.string().optional(), dataFinal: z.string().optional() };

export function construirTools(deps: ToolDeps) {
  const hoje = deps.hoje ?? new Date();
  return {
    consultar_notas_fiscais: tool({
      description: "Notas fiscais (NF-e) do período: itens, CFOP por item, natureza da operação; separa venda de bonificação.",
      inputSchema: z.object({ ...periodoArgs, tipo: z.number().optional() }),
      execute: (a) => consultarNotasFiscais({ client: deps.client }, a as any, hoje),
    }),
    consultar_financeiro: tool({
      description: "Contas a pagar/receber no período; distingue pago x em aberto (por situação).",
      inputSchema: z.object({ tipo: z.enum(["a_receber","a_pagar"]), ...periodoArgs }),
      execute: (a) => consultarFinanceiro({ client: deps.client, hoje }, a as any, hoje),
    }),
    bling_consultar_api: tool({
      description: "Escape hatch: consulta QUALQUER endpoint de LEITURA da API v3 do Bling que as outras tools não cobrem. Use path como '/nfe', '/contas/pagar', etc., com params e paginação.",
      inputSchema: z.object({ path: z.string(), params: z.record(z.any()).optional(), todasPaginas: z.boolean().optional(), maxPaginas: z.number().optional() }),
      execute: (a) => consultarApi({ client: deps.client }, a as any),
    }),
    // ... consultar_vendas, consultar_faturamento, consultar_estoque, consultar_producao,
    //     consultar_clientes, consultar_catalogo, consultar_pedidos, gerar_relatorio_diario
    //     (adaptar cada uma para tool({...}) chamando a função existente em src/tools/*)
  };
}
```
> Adaptar TODAS as tools existentes para o formato `tool({...})`. Manter os nomes atuais (`consultar_vendas` etc.) para não perder cobertura.

- [ ] **Step 4: Rodar (deve passar) + typecheck** — PASS.

- [ ] **Step 5: Commit**
```bash
git add src/agent/tools.ts tests/tools.test.ts
git commit -m "feat: tools no formato AI SDK (tier1 típadas + escape hatch)"
```

---

## Task 11: Reescrever o agent loop (streamText multi-step)

**Files:**
- Modify: `src/agent/agentLoop.ts`
- Test: `tests/agentLoop.test.ts`

- [ ] **Step 1: Teste falhando** — testar que o loop chama o modelo e retorna texto, com modelo mockado:
```ts
import { describe, it, expect } from "vitest";
import { runAgent } from "../src/agent/agentLoop";

it("retorna texto do modelo (mock)", async () => {
  const fakeModel = {} as any;
  const overrides = { streamTextImpl: async () => ({ text: Promise.resolve("olá gestor"), fullStream: (async function*(){})() }) };
  const r = await runAgent({ model: fakeModel, mensagens: [{ role: "user", content: "oi" }], deps: { client: {} as any, situacoesFaturado: [] }, systemPrompt: "sys", maxSteps: 5, ...overrides });
  expect(r.texto).toContain("olá");
});
```

- [ ] **Step 2: Rodar (deve falhar)** — FAIL.

- [ ] **Step 3: Implementar** — reescrever `agentLoop.ts` usando AI SDK, com injeção de `streamText` para testabilidade:
```ts
import { streamText, stepCountIs, type LanguageModel } from "ai";
import { construirTools, type ToolDeps } from "./tools";

export interface Mensagem { role: "user" | "assistant"; content: any; }
export interface RunAgentParams {
  model: LanguageModel;
  mensagens: Mensagem[];
  deps: ToolDeps;
  systemPrompt: string;
  maxSteps?: number;
  onEvent?: (ev: { tipo: "tool"; nome: string } | { tipo: "texto"; delta: string }) => void;
  streamTextImpl?: typeof streamText; // para testes
}

export async function runAgent(p: RunAgentParams): Promise<{ texto: string }> {
  const impl = p.streamTextImpl ?? streamText;
  const result: any = await impl({
    model: p.model,
    system: p.systemPrompt,
    messages: p.mensagens as any,
    tools: construirTools(p.deps),
    stopWhen: stepCountIs(p.maxSteps ?? 20),
  });
  if (p.onEvent && result.fullStream) {
    for await (const part of result.fullStream) {
      if (part.type === "tool-call") p.onEvent({ tipo: "tool", nome: part.toolName });
      else if (part.type === "text-delta") p.onEvent({ tipo: "texto", delta: part.text ?? part.textDelta ?? "" });
    }
  }
  const texto = (await result.text)?.trim() || "Sem resposta.";
  return { texto };
}
```
> Confirmar nomes de campos do `fullStream` (`tool-call`, `text-delta`) na versão instalada do AI SDK.

- [ ] **Step 4: Rodar (deve passar)** — PASS.

- [ ] **Step 5: Commit**
```bash
git add src/agent/agentLoop.ts tests/agentLoop.test.ts
git commit -m "feat: agent loop multi-step com AI SDK (streaming de eventos)"
```

---

## Task 12: System prompt capabilities-first + KB

**Files:**
- Modify: `src/agent/systemPrompt.ts`, `src/agent/conhecimento.md`
- Test: `tests/systemPrompt.test.ts`

- [ ] **Step 1: Teste falhando**
```ts
it("prompt cita NF-e/fiscal e financeiro pago/aberto e autonomia", () => {
  const s = montarSystemPrompt(new Date("2026-07-15"));
  expect(s).toMatch(/NF-?e|fiscal|CFOP/i);
  expect(s).toMatch(/pago|em aberto/i);
  expect(s).toMatch(/bling_consultar_api|paginar|múltiplos passos|autonom/i);
});
```

- [ ] **Step 2: Rodar (deve falhar)** — FAIL.

- [ ] **Step 3: Implementar** — atualizar `montarSystemPrompt` para listar todas as áreas e instruir autonomia (planejar multi-step, paginar até ter o dado, cruzar fontes, distinguir venda×bonificação por CFOP e pago×aberto, usar `bling_consultar_api` quando faltar tool típada, só dizer "não tenho" se o dado não existir na API). Em `conhecimento.md`, corrigir o trecho "acesso em 4 áreas" para refletir a cobertura completa.

- [ ] **Step 4: Rodar (deve passar)** — PASS.

- [ ] **Step 5: Commit**
```bash
git add src/agent/systemPrompt.ts src/agent/conhecimento.md tests/systemPrompt.test.ts
git commit -m "feat: system prompt capabilities-first + autonomia; corrige KB"
```

---

## Task 13: Wire-up no server + endpoint SSE

**Files:**
- Modify: `src/server.ts`, `src/bootstrap.ts` (se necessário para injetar model/config)
- Test: `tests/` (supertest do endpoint, com model mockado)

- [ ] **Step 1: Teste falhando** — testar que `POST /api/chat/stream` responde `text/event-stream` e emite ao menos um evento (injetando um `runAgent`/model fake). Usar supertest como nos testes atuais de server.

- [ ] **Step 2: Rodar (deve falhar)** — FAIL.

- [ ] **Step 3: Implementar** — em `server.ts`:
  - Construir o modelo via `criarModelo(config)` no bootstrap e injetar nas rotas.
  - Manter `POST /api/chat` (não-streaming) chamando `runAgent` e devolvendo `{ texto }` (fallback).
  - Adicionar `POST /api/chat/stream`: setar headers SSE (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`), passar `onEvent` que faz `res.write("data: " + JSON.stringify(ev) + "\n\n")`, e ao fim `res.write` do texto final + `res.end()`.
  - Passar `systemPrompt: montarSystemPrompt()` e `maxSteps: config.agentMaxSteps`.

- [ ] **Step 4: Rodar (deve passar) + suíte completa** — `npm test` — PASS.

- [ ] **Step 5: Commit**
```bash
git add src/server.ts src/bootstrap.ts tests
git commit -m "feat: endpoint SSE /api/chat/stream (mantém /api/chat como fallback)"
```

---

## Task 14 🎨: Frontend — consumir stream + timeline de tool-calls

**Files:**
- Modify: `web/src/lib/api.ts`, `web/src/components/Chat.tsx`
- **USAR skill `frontend-design`** (regra permanente de UI; shadcn/ui, tema café atual)

- [ ] **Step 1: Invocar o skill** — o executor DEVE começar invocando `frontend-design` antes de tocar em `web/`.

- [ ] **Step 2: `api.ts`** — adicionar função que faz `POST /api/chat/stream`, lê o `ReadableStream` da resposta, parseia linhas `data: {json}` e chama callbacks `onTool(nome)` / `onDelta(texto)` / `onDone(textoFinal)`. Manter a função não-streaming como fallback.

- [ ] **Step 3: `Chat.tsx`** — ao enviar, usar a função streaming: renderizar tokens conforme chegam e mostrar uma **timeline** compacta dos tool-calls ("🔍 consultando NF-e…", "📄 paginando contas a pagar…") acima/junto da resposta. Preservar shadcn e identidade visual (tema café escuro atual). Estados de loading/erro claros.

- [ ] **Step 4: Build do frontend** — Run: `npm --prefix web run build` — Expected: build sem erros.

- [ ] **Step 5: Commit**
```bash
git add web/src/lib/api.ts web/src/components/Chat.tsx
git commit -m "feat(web): streaming de resposta + timeline de tool-calls (frontend-design)"
```

---

## Task 15: Migração de testes + verificação final

**Files:**
- Modify: testes remanescentes que ainda assumam contratos antigos
- Test: suíte inteira

- [ ] **Step 1: Rodar suíte inteira** — Run: `npm test` — corrigir qualquer teste que ainda espere shapes antigos (arrays em vez de `{itens,truncado}`, observações hardcoded removidas, etc.). Ajustar para os novos contratos definidos nas Tasks 3–8.
- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` — Expected: 0 erros.
- [ ] **Step 3: Build web** — Run: `npm --prefix web run build` — Expected: OK.
- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "test: migra suíte para os novos contratos do agente autônomo"
```

---

## Task 16: Smoke manual (credenciais reais) — checklist, não automatizado

> Depende de `.env` real + `npm run bling:auth`. Não roda no CI. Documentar o resultado.

- [ ] `npm start`, logar no site.
- [ ] Perguntar **exatamente** a pergunta do print 3: *"Todos os produtos lançados em nota fiscal foram de CFOP de venda ou teve bonificações?"* → deve responder com breakdown por CFOP e separar venda × bonificação.
- [ ] Perguntar a do print 4: *"Qual foi o total de contas pagas no mês passado?"* → deve distinguir **pago × em aberto**.
- [ ] Perguntar algo que exija a escape hatch (ex.: um recurso não coberto por tool típada) e confirmar que o agente usa `bling_consultar_api`.
- [ ] Conferir que nenhuma resposta diz "não tenho acesso" para dado que existe na API.
- [ ] Registrar no PR os prints do "antes/depois".

---

## Self-review do plano (checar contra a spec)

- **Cobertura:** §4.1 provider→Task 2; §4.2 loop→Task 11; §4.3 tools tier1/tier2→Tasks 7–10; §4.4 client/endpoints→Tasks 3–5; §4.5 guard→Task 6; §4.6 prompt/KB→Task 12; §4.7 UI→Task 14; §5 cobertura→Tasks 4–5,7; §9 testes→todas; critérios de sucesso §13→Task 16. ✔
- **Sem placeholders de código:** cada task tem teste e implementação reais; "adaptar demais tools" referencia arquivos existentes no repo (não tipos inexistentes). ✔
- **Consistência de tipos:** `getAllPages`/endpoints → `{ itens, truncado }` (Tasks 3–5), consumido igual em 7–9; `construirTools(deps)` (Task 10) consumido no loop (Task 11); `criarModelo(cfg)` (Task 2) usado no server (Task 13). ✔
