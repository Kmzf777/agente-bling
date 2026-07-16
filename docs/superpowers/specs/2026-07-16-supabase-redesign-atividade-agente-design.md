# Redesign "Supabase-clone" + Atividade do Agente — Design/Spec

- **Data:** 2026-07-16
- **Status:** Aprovado (design aprovado pelo dono do produto)
- **Depende de:** agente autônomo já entregue (`docs/superpowers/specs/2026-07-15-openbling-agente-autonomo-design.md`)

## 1. Objetivo

Redefinir **completamente** o visual do chat para um **clone da estética do Supabase** (dark frio, técnico, verde-assinatura), e fazer o agente **demonstrar de verdade o que está fazendo** — cada passo vira um **card de atividade** com a ação real, os parâmetros e um resumo do resultado (rodando → concluído), em vez de só "pensando".

Duas frentes independentes: **A) Design system** e **B) Atividade do agente** (full-stack).

## 2. Decisões

| Tema | Escolha |
|---|---|
| Identidade | **Clone Supabase literal** — dark frio, verde `#3ECF8E`, mono para dados. Sai a alma café (âmbar/crema/Fraunces/grão/vapor). |
| Atividade | **Cards de ação** com params + resumo do resultado + status. Backend emite args da tool + resumo do retorno. |
| Base de UI | Mantém **shadcn/ui** + **Tailwind v4** (CSS-first). Re-tematiza; **não** migra pra v3. |
| Fontes | **Geist** (sans, já instalada) + **Geist Mono** (números/params/dados). Remove Fraunces. |
| IP | Emula a estética pública do Supabase (paleta/densidade/layout) com tokens e componentes **originais**. Nada de fonte proprietária (Circular) nem cópia de código-fonte. |

## 3. Frente A — Design system "Supabase-clone"

Aplicar via os módulos da skill `ui-ux-pro-max` em disco (`design-system` → token-architecture/primitive/semantic/component; `ui-styling` → shadcn-theming) + skill `frontend-design`.

### 3.1 Paleta (dark-first) — alvos em hex, expressos como tokens `oklch` no `@theme`
Manter a **estrutura v4 atual** (`@theme inline` + vars `oklch` em `:root`/`.dark`), só trocando os valores. Dark-first (app roda em dark).

| Token | Alvo (hex) | Papel |
|---|---|---|
| `--background` | `#171717` | fundo base |
| `--card` / superfície | `#1c1c1c` → `#1f1f1f` | cards/painéis |
| `--border` | `#2e2e2e` | bordas sutis (1px) |
| `--foreground` | `#ededed` | texto primário |
| `--muted-foreground` | `#a0a0a0` | texto secundário |
| `--primary` | `#3ECF8E` | verde-assinatura (ações, foco, links) |
| `--primary-foreground` | `#0a0a0a` | texto sobre verde |
| `--ring` | `#3ECF8E` (com alpha) | foco |
| `--destructive` | `#f87171`/`#e5484d` | erro |
| success/warning | verde primário / `#f5a623` | status |

Converter os alvos para `oklch` (o subagent gera os valores exatos com o módulo `design-system`). Remover tokens `--crema`/`--cereja`.

### 3.2 Tipografia
- `--font-sans: 'Geist Variable', ...` (mantém). Adicionar `--font-mono: 'Geist Mono Variable', ui-monospace, monospace` (instalar `@fontsource-variable/geist-mono`).
- **Números, valores R$, params de tool e nomes de campo** → mono. Remover `--font-heading` (Fraunces); headings passam a Geist (peso/tracking, não serif).

### 3.3 Raio, espaçamento, densidade
- `--radius: 0.5rem` (Supabase é menos arredondado que o café atual `0.75rem`). Ritmo de espaçamento 4/8px.
- Densidade técnica: linhas finas, divisores visíveis, menos "respiro fofo".

### 3.4 Motion
- Remover animações café (`canastra-steam/rise/pour`, `.canastra-grain`, `.canastra-topo`). 
- Micro-interações **150–300ms**, easing sóbrio. Estado "rodando" com um **shimmer/pulse discreto** (não vapor). **Respeitar `prefers-reduced-motion`** (desliga animações).

### 3.5 Componentes
- **Re-tema** shadcn: `button`, `card`, `input`, `textarea`, `scroll-area` (novo look: bordas `#2e2e2e`, hover sutil, foco verde).
- **Novos primitivos:**
  - `AtividadeCard` — card de um passo do agente (ícone Lucide, rótulo, params em mono, `StatusPill`, resumo).
  - `StatusPill` — `rodando` (spinner/pulse) · `concluído` (check verde) · `erro` (vermelho).
- Aplicar em **Chat.tsx**, **Login.tsx** e **index.css**.

### 3.6 Barras de qualidade (do `pro-rules`)
Ícones Lucide vetoriais (sem emoji estrutural), tamanho/stroke consistentes; contraste ≥4.5:1 (texto) e ≥3:1 (secundário/bordas) no dark; estados disabled claros; tudo via tokens semânticos (sem hex hardcoded nos componentes); reduced-motion suportado.

## 4. Frente B — Agente demonstra o que faz (full-stack, TDD)

### 4.1 Novos eventos (backend)
`runAgent` passa a correlacionar tool-call e tool-result por `toolCallId` e emitir:
```
{ tipo: "tool_inicio", id, nome, args }   // do fullStream 'tool-call' → input
{ tipo: "tool_fim",    id, resumo }        // do fullStream 'tool-result' → output (resumido)
```
Mantém `{tipo:"texto",delta}` · `{tipo:"fim",texto}` · `{tipo:"erro",erro}`.
> Confirmar no AI SDK v5 os campos das partes: `tool-call` → `toolCallId`/`toolName`/`input`; `tool-result` → `toolCallId`/`toolName`/`output`.

### 4.2 `resumirResultado(nome, output)` — helper testável (`src/agent/resumo.ts`)
Uma linha curta por tool (valores em R$ compacto):
- `consultar_vendas` → `"{n} pedidos · R$ {total}"`
- `consultar_faturamento` → `"R$ {faturamento}"` (+ `" ({x}% vs anterior)"` se houver)
- `consultar_notas_fiscais` → `"{n} NF-e · venda R$ {venda}"` (+ `" · bonif. R$ {bonif}"` se >0)
- `consultar_financeiro` → `"pago R$ {pago} · aberto R$ {aberto}"`
- `consultar_estoque` → `"{n} itens"` (+ `" abaixo do mínimo"` se filtro)
- `consultar_producao` → `"{n} ordens · {q} un"`
- `consultar_catalogo` → `"{n} produtos"`
- `consultar_clientes` → `"{n} clientes"` (ou maior cliente)
- `consultar_pedidos` → `"{n} pedidos"`
- `gerar_relatorio_diario` → `"relatório do dia"`
- `bling_consultar_api` → `"{n} registros"`
- fallback → `"concluído"`

### 4.3 Frontend
- `api.ts`: `enviarChatStream` passa a reconhecer `tool_inicio`/`tool_fim` além dos atuais; callbacks `onToolInicio({id,nome,args})` / `onToolFim({id,resumo})`.
- `Chat.tsx`: estado de stream vira lista de **passos** (`{id, nome, args, resumo?, status}`). Renderiza um `AtividadeCard` por passo. Rótulo humano derivado de `nome`+`args` (ex.: *"Consultando NF-e · jun/2026"*), params em mono, `StatusPill`, e o resumo ao concluir. Texto final streama abaixo dos cards.

## 5. Arquivos

**Frente A:** `web/src/index.css` (tokens/motion/fontes) · `web/src/components/ui/{button,card,input,textarea,scroll-area}.tsx` (re-tema) · `web/src/components/AtividadeCard.tsx` + `StatusPill.tsx` (novos) · `web/src/components/Login.tsx` · `web/package.json` (geist-mono).
**Frente B:** `src/agent/resumo.ts` (novo) · `src/agent/agentLoop.ts` (eventos ricos) · `src/server.ts` (passthrough) · `web/src/lib/api.ts` · `web/src/components/Chat.tsx`.

## 6. Testes
- `resumirResultado` — um caso por tool (Vitest).
- `agentLoop` — mock de `fullStream` com `tool-call`+`tool-result` → verifica `tool_inicio`/`tool_fim` com `id`, `args`, `resumo`.
- `serverStream` — o SSE repassa os novos eventos.
- `web build` limpo; suíte backend verde; typecheck 0 erros.
- Smoke visual: rodar o app e conferir dark Supabase + cards de atividade com params/resumo (manual).

## 7. Fora de escopo
Toggle claro/escuro (fica dark-first) · gráficos/charts novos · mudanças no motor do agente ou nas tools de dados · i18n.

## 8. Critérios de sucesso
1. Visual dark "Supabase" coeso (verde `#3ECF8E`, Geist+mono, bordas `#2e2e2e`, raio menor), sem resíduo café.
2. Cada consulta aparece como card com **ação + params + resumo do resultado** e status rodando→concluído.
3. Sem emoji estrutural; contraste AA; reduced-motion respeitado.
4. Suíte verde, typecheck limpo, web build ok.

## 9. Execução
Via **subagent** (pedido do usuário). A skill `ui-ux-pro-max` **não está instalada** (só o marketplace foi adicionado) — o subagent **lê os arquivos** em `...\plugins\marketplaces\ui-ux-pro-max-skill\.claude\skills\{ui-ux-pro-max,design-system,ui-styling}\` e aplica, junto com `frontend-design`. Frente B (backend) por TDD. Trabalho isolado numa branch de feature.
