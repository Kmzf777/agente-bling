# Redesign Supabase-clone + Atividade do Agente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`).
> **UI:** Tasks de `web/` (Frente A) DEVEM ler e aplicar os arquivos da skill em `C:\Users\rafae\.claude\plugins\marketplaces\ui-ux-pro-max-skill\.claude\skills\{design-system,ui-styling,ui-ux-pro-max}\` **e** usar o skill `frontend-design`. NÃO migrar Tailwind v4→v3.

**Goal:** Trocar o visual do chat por um clone da estética Supabase (dark frio, verde `#3ECF8E`, Geist+mono) e transformar o "pensando" em cards de atividade com ação + params + resumo do resultado.

**Architecture:** Frente B (backend, TDD): `resumo.ts` + eventos ricos no `agentLoop` (correlacionados por `toolCallId`) que fluem pelo SSE. Frente A (frontend): novos tokens Tailwind v4, fontes, componentes `AtividadeCard`/`StatusPill`, e Chat/Login re-tematizados.

**Tech Stack:** Node+TS, Vercel AI SDK v5, Vitest · React+Vite+**Tailwind v4 (CSS-first)**+shadcn, Geist/Geist Mono, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-16-supabase-redesign-atividade-agente-design.md`

---

## Notas para executores
- Backend: `npm test`, `npm run typecheck`. Frontend: `npm --prefix web run build`.
- Confirmar campos do `fullStream` do AI SDK v5 em `node_modules/ai/dist/index.d.ts` (`tool-call` → `toolCallId`/`toolName`/`input`; `tool-result` → `toolCallId`/`toolName`/`output`).
- Cores base como **hex** (match exato ao Supabase); `color-mix(in oklch, …)` continua funcionando com hex.
- Branch de feature já criada (`feat/supabase-redesign`). Não fazer push.

---

# FRENTE B — Backend (TDD)

## Task 1: Helper `resumirResultado`

**Files:** Create `src/agent/resumo.ts`, `tests/resumo.test.ts`

- [ ] **Step 1: Teste falhando** (`tests/resumo.test.ts`)
```ts
import { describe, it, expect } from "vitest";
import { resumirResultado } from "../src/agent/resumo";

describe("resumirResultado", () => {
  it("vendas", () => expect(resumirResultado("consultar_vendas", { numeroPedidos: 2, valorTotal: 150 })).toBe("2 pedidos · R$ 150"));
  it("notas fiscais com bonificação", () =>
    expect(resumirResultado("consultar_notas_fiscais", { totalNotas: 3, totalVenda: 45000, totalBonificacao: 30 }))
      .toBe("3 NF-e · venda R$ 45.000 · bonif. R$ 30"));
  it("financeiro pago/aberto", () =>
    expect(resumirResultado("consultar_financeiro", { totalPago: 100, totalEmAberto: 75 })).toBe("pago R$ 100 · aberto R$ 75"));
  it("estoque abaixo do mínimo", () =>
    expect(resumirResultado("consultar_estoque", { total: 4, filtro: "abaixo_minimo" })).toBe("4 itens abaixo do mínimo"));
  it("fallback desconhecido", () => expect(resumirResultado("qualquer_coisa", {})).toBe("concluído"));
});
```

- [ ] **Step 2: Rodar (falha)** — `npx vitest run tests/resumo.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** (`src/agent/resumo.ts`)
```ts
function fmtBRL(v: unknown): string {
  const n = Math.round(Number(v) || 0);
  const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${n < 0 ? "-" : ""}${s}`;
}

export function resumirResultado(nome: string, output: any): string {
  const o = output ?? {};
  switch (nome) {
    case "consultar_vendas":
      return `${o.numeroPedidos ?? 0} pedidos · ${fmtBRL(o.valorTotal)}`;
    case "consultar_faturamento":
      return `${fmtBRL(o.faturamento)}${o.variacaoPercentual != null ? ` (${o.variacaoPercentual}% vs anterior)` : ""}`;
    case "consultar_notas_fiscais":
      return `${o.totalNotas ?? 0} NF-e · venda ${fmtBRL(o.totalVenda)}${Number(o.totalBonificacao) > 0 ? ` · bonif. ${fmtBRL(o.totalBonificacao)}` : ""}`;
    case "consultar_financeiro":
      return `pago ${fmtBRL(o.totalPago)} · aberto ${fmtBRL(o.totalEmAberto)}`;
    case "consultar_estoque":
      return `${o.total ?? o.itens?.length ?? 0} itens${o.filtro === "abaixo_minimo" ? " abaixo do mínimo" : ""}`;
    case "consultar_producao":
      return `${o.numeroOrdens ?? 0} ordens · ${o.quantidadeTotal ?? 0} un`;
    case "consultar_catalogo":
      return `${o.total ?? o.produtos?.length ?? 0} produtos`;
    case "consultar_clientes":
      return `${o.total ?? o.clientes?.length ?? 0} clientes`;
    case "consultar_pedidos":
      return `${o.pedidos?.length ?? o.total ?? 0} pedidos`;
    case "gerar_relatorio_diario":
      return "relatório do dia";
    case "bling_consultar_api":
      return `${Array.isArray(o.dados) ? o.dados.length : 1} registros`;
    default:
      return "concluído";
  }
}
```

- [ ] **Step 4: Rodar (passa)** — `npx vitest run tests/resumo.test.ts` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/agent/resumo.ts tests/resumo.test.ts
git commit -m "feat: resumirResultado — resumo de 1 linha por tool"
```

---

## Task 2: `agentLoop` emite `tool_inicio`/`tool_fim`

**Files:** Modify `src/agent/agentLoop.ts`, `tests/agentLoop.test.ts`

- [ ] **Step 1: Teste falhando** — adicionar em `tests/agentLoop.test.ts`:
```ts
it("emite tool_inicio (com args) e tool_fim (com resumo)", async () => {
  async function* fs() {
    yield { type: "tool-call", toolCallId: "c1", toolName: "consultar_vendas", input: { periodo: "hoje" } };
    yield { type: "tool-result", toolCallId: "c1", toolName: "consultar_vendas", output: { numeroPedidos: 2, valorTotal: 150 } };
    yield { type: "text-delta", text: "pronto" };
  }
  const streamTextImpl: any = () => ({ text: Promise.resolve("pronto"), fullStream: fs() });
  const eventos: any[] = [];
  await runAgent({
    model: {} as any, systemPrompt: "s", mensagens: [{ role: "user", content: "x" }],
    deps: { client: {} as any, situacoesFaturado: [] }, onEvent: (e) => eventos.push(e), streamTextImpl,
  });
  expect(eventos).toEqual([
    { tipo: "tool_inicio", id: "c1", nome: "consultar_vendas", args: { periodo: "hoje" } },
    { tipo: "tool_fim", id: "c1", resumo: "2 pedidos · R$ 150" },
    { tipo: "texto", delta: "pronto" },
  ]);
});
```
> Remover/ajustar o teste antigo "emite eventos de tool e de texto a partir do fullStream" (que esperava `{tipo:"tool",nome}`), substituindo-o por este.

- [ ] **Step 2: Rodar (falha)** — `npx vitest run tests/agentLoop.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — em `src/agent/agentLoop.ts`:
  1. importar `import { resumirResultado } from "./resumo";`
  2. trocar o tipo:
```ts
export type AgentEvent =
  | { tipo: "tool_inicio"; id: string; nome: string; args: unknown }
  | { tipo: "tool_fim"; id: string; resumo: string }
  | { tipo: "texto"; delta: string };
```
  3. trocar o loop de eventos:
```ts
  if (p.onEvent && result.fullStream) {
    for await (const part of result.fullStream) {
      if (part.type === "tool-call") p.onEvent({ tipo: "tool_inicio", id: part.toolCallId, nome: part.toolName, args: part.input });
      else if (part.type === "tool-result") p.onEvent({ tipo: "tool_fim", id: part.toolCallId, resumo: resumirResultado(part.toolName, part.output) });
      else if (part.type === "text-delta") p.onEvent({ tipo: "texto", delta: part.text ?? "" });
    }
  }
```

- [ ] **Step 4: Rodar (passa) + suíte + typecheck** — `npm test && npm run typecheck` → PASS/0.
- [ ] **Step 5: Commit**
```bash
git add src/agent/agentLoop.ts tests/agentLoop.test.ts
git commit -m "feat: agentLoop emite tool_inicio/tool_fim correlacionados por toolCallId"
```

---

## Task 3: SSE repassa os novos eventos

**Files:** Modify `tests/serverStream.test.ts`

O `/api/chat/stream` já serializa qualquer evento do `onEvent` (genérico) — só precisamos de teste garantindo o passthrough dos novos tipos.

- [ ] **Step 1: Teste falhando** — adicionar em `tests/serverStream.test.ts`:
```ts
it("repassa tool_inicio e tool_fim no SSE", async () => {
  const app = criarApp(cfg, {
    runAgent: async () => ({ texto: "ok" }),
    runAgentStream: async ({ onEvent }: any) => {
      onEvent({ tipo: "tool_inicio", id: "c1", nome: "consultar_notas_fiscais", args: { periodo: "mes_passado" } });
      onEvent({ tipo: "tool_fim", id: "c1", resumo: "3 NF-e · venda R$ 45.000" });
      return { texto: "pronto" };
    },
  });
  const token = tokenEsperado("s");
  const r = await request(app).post("/api/chat/stream").set("Authorization", `Bearer ${token}`).send({ mensagens: [] }).expect(200);
  expect(r.text).toContain('"tipo":"tool_inicio"');
  expect(r.text).toContain('"nome":"consultar_notas_fiscais"');
  expect(r.text).toContain('"tipo":"tool_fim"');
  expect(r.text).toContain("R$ 45.000");
});
```

- [ ] **Step 2: Rodar** — `npx vitest run tests/serverStream.test.ts`. Se já passar (server genérico), ótimo — este teste trava o contrato. Se falhar, ajustar `server.ts` para não filtrar eventos.
- [ ] **Step 3: Commit**
```bash
git add tests/serverStream.test.ts
git commit -m "test: SSE repassa tool_inicio/tool_fim"
```

---

# FRENTE A — Frontend (subagent com ui-ux-pro-max + frontend-design)

> Antes de tocar em `web/`: ler `.../skills/design-system/SKILL.md` + `references/{token-architecture,primitive-tokens,semantic-tokens}.md`, `.../skills/ui-styling/references/shadcn-theming.md`, `.../skills/ui-ux-pro-max/references/pro-rules.md`; e invocar `frontend-design`.

## Task 4: Tokens Supabase + fontes + motion (`web/src/index.css`)

**Files:** Modify `web/src/index.css`, `web/package.json`

- [ ] **Step 1: Instalar mono** — `npm --prefix web install @fontsource-variable/geist-mono`
- [ ] **Step 2: Reescrever tokens** em `web/src/index.css` mantendo a estrutura v4 (`@theme inline` + `:root`/`.dark`), com estes valores **exatos** (hex). Dark é o tema ativo:
  - `.dark` (ativo): `--background:#171717; --card:#1c1c1c; --popover:#1f1f1f; --foreground:#ededed; --muted:#232323; --muted-foreground:#a0a0a0; --border:#2e2e2e; --input:#2e2e2e; --primary:#3ECF8E; --primary-foreground:#0a0a0a; --secondary:#232323; --secondary-foreground:#ededed; --accent:#232323; --accent-foreground:#ededed; --ring:#3ECF8E; --destructive:#e5484d; --radius:0.5rem;`
  - `:root` (fallback claro coerente, mesma família fria): fundo `#ffffff`, texto `#171717`, borda `#e6e6e6`, primary `#3ECF8E`, etc.
  - Adicionar no `@theme`: `--font-mono: 'Geist Mono Variable', ui-monospace, SFMono-Regular, monospace;` e **remover** `--font-heading`/`--font-serif` (Fraunces), `--color-crema`/`--color-cereja`.
  - `@import "@fontsource-variable/geist-mono";` no topo; remover o import da Fraunces.
  - Em `@layer base`, `h1,h2,h3` deixam de usar `font-heading` (usam Geist com peso/tracking).
  - **Remover** os componentes/utilitários café: `.canastra-grain`, `.canastra-topo`, e keyframes `canastra-steam/rise/pour` (serão substituídos). Adicionar um utilitário sóbrio `@keyframes pulse-soft` (opacity 0.5↔1, 1.4s) e envolver animações em `@media (prefers-reduced-motion: no-preference)`.
- [ ] **Step 3: Build** — `npm --prefix web run build` → sem erros.
- [ ] **Step 4: Commit** — `git add web/src/index.css web/package.json web/package-lock.json && git commit -m "feat(web): tokens Supabase-clone (dark, verde #3ECF8E) + Geist Mono; remove estética café"`

## Task 5: Re-tema dos primitivos shadcn

**Files:** Modify `web/src/components/ui/{button,card,input,textarea,scroll-area}.tsx`

- [ ] Aplicar o novo idioma Supabase nos primitivos (guiado pela skill): botões com raio `rounded-md`, foco anel verde (`ring-ring`), hover sutil; cards `bg-card border-border` (borda 1px `#2e2e2e`), sombra discreta; inputs/textarea fundo `bg-background`/`bg-card`, borda `border-input`, foco verde. Manter as APIs/props existentes (só estilo). Sem hex hardcoded — usar tokens.
- [ ] **Build + commit** — `npm --prefix web run build` → ok; `git commit -m "feat(web): re-tema dos primitivos shadcn (Supabase)"`

## Task 6: Componentes `StatusPill` e `AtividadeCard`

**Files:** Create `web/src/components/StatusPill.tsx`, `web/src/components/AtividadeCard.tsx`

- [ ] **StatusPill** — props `{ status: "rodando" | "concluido" | "erro" }`. Ícone Lucide (Loader2 girando/`Check`/`AlertTriangle`) + rótulo; cores por token (`primary` p/ concluído, `destructive` p/ erro, `muted-foreground` p/ rodando). Sem emoji.
- [ ] **AtividadeCard** — props:
```ts
type Passo = { id: string; nome: string; args?: Record<string, unknown>; resumo?: string; status: "rodando" | "concluido" | "erro" };
```
  Renderiza: ícone Lucide da tool (reaproveitar o mapa `TOOL_INFO` — mover para um módulo compartilhado `web/src/lib/tools.ts`), **rótulo humano** (ex.: `Consultando NF-e`), **params em mono** (formatar `args`: `periodo`→`jun/2026`, `tipo`→texto), `StatusPill`, e o `resumo` (mono) quando `status !== "rodando"`. Card `bg-card border border-border rounded-md`, densidade técnica.
- [ ] **Build + commit** — `git commit -m "feat(web): AtividadeCard + StatusPill (passo do agente com params e resumo)"`

## Task 7: `api.ts` — parse dos novos eventos

**Files:** Modify `web/src/lib/api.ts`

- [ ] Estender `EventoChat` e `CallbacksStream`:
```ts
export type EventoChat =
  | { tipo: "tool_inicio"; id: string; nome: string; args?: Record<string, unknown> }
  | { tipo: "tool_fim"; id: string; resumo: string }
  | { tipo: "texto"; delta: string }
  | { tipo: "fim"; texto: string }
  | { tipo: "erro"; erro: string };

export type CallbacksStream = {
  onToolInicio?: (p: { id: string; nome: string; args?: Record<string, unknown> }) => void;
  onToolFim?: (p: { id: string; resumo: string }) => void;
  onDelta?: (delta: string) => void;
  onFim?: (textoFinal: string) => void;
};
```
  No loop de parsing, mapear `tool_inicio`→`onToolInicio`, `tool_fim`→`onToolFim`, mantendo `texto/fim/erro`.
- [ ] **Build + commit** — `git commit -m "feat(web): api consome tool_inicio/tool_fim"`

## Task 8: `Chat.tsx` (passos + cards) e `Login.tsx`

**Files:** Modify `web/src/components/Chat.tsx`, `web/src/components/Login.tsx`

- [ ] **Chat.tsx**: trocar `EstadoStream = { conteudo; ferramentas: string[] }` por `{ conteudo: string; passos: Passo[] }`. Callbacks: `onToolInicio` adiciona passo `status:"rodando"`; `onToolFim` marca o passo (por `id`) `concluido` + `resumo`; `onDelta` acumula texto. Render: lista de `AtividadeCard` (um por passo) + texto final abaixo. Remover `AgenteAoVivo`/`Pensando`/`Ponto` café e o `TOOL_INFO` local (agora em `lib/tools.ts`). Estado inicial e bolhas re-tematizados (Supabase). Trocar ícones/gradientes café por neutros + verde.
- [ ] **Login.tsx**: re-tematizar para o dark Supabase (mesmos tokens; sem crema/café).
- [ ] **Build + commit** — `npm --prefix web run build` → ok; `git commit -m "feat(web): chat com cards de atividade + Login re-tematizado (Supabase)"`

## Task 9: Verificação final

- [ ] `npm test` (backend) → verde · `npm run typecheck` → 0 · `npm --prefix web run build` → ok.
- [ ] Grep de resíduo café: nenhum `crema`/`cereja`/`Fraunces`/`canastra-grain`/`canastra-topo` restante em `web/src` (exceto nomes de marca legítimos como classe `.canastra-topo` já removida).
- [ ] **Smoke visual** (manual, usuário): `npm start`, perguntar algo que use várias tools e conferir: dark Supabase, verde `#3ECF8E`, cards com ação+params+resumo (rodando→concluído).
- [ ] **Commit** de quaisquer ajustes — `git commit -m "chore: verificação final do redesign"`

---

## Self-review (plano × spec)
- Design system (spec §3) → Tasks 4–6, 8. Atividade agente (spec §4) → Tasks 1–3 (backend), 7–8 (frontend). Testes (spec §6) → Tasks 1–3, 9. Critérios (spec §8) → Task 9. ✔
- Tipos consistentes: `AgentEvent`(Task 2) ↔ `EventoChat`(Task 7) ↔ `Passo`(Tasks 6,8); `resumirResultado`(Task 1) usado em Task 2. ✔
- Sem placeholders de código no backend (Frente B tem código real). Frente A: tokens exatos + contratos; craft visual delegado à skill (natureza de design). ✔
