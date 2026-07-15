# OpenBling — Agente Autônomo de Gestão (Café Canastra) — Design/Spec

- **Data:** 2026-07-15
- **Status:** Aprovado (spec + plano pré-aprovados pelo dono do produto)
- **Autor:** Claude (superpowers: brainstorming → writing-plans)
- **Substitui parcialmente:** `docs/superpowers/specs/2026-07-11-agente-bling-cafe-design.md`

## 1. Contexto e problema

O agente atual responde de forma **truncada e limitada** mesmo com todos os escopos de leitura do
Bling liberados. Investigação (debugging sistemático) identificou que a causa **não** são os escopos,
e sim a **arquitetura**. Sete causas se somam:

| # | Causa raiz | Evidência |
|---|---|---|
| 1 | **Sem acesso a NF-e / fiscal** | `src/bling/endpoints.ts` não tem nenhum endpoint de nota fiscal → impossível responder CFOP/bonificação |
| 2 | **Faturamento é proxy** | `consultarFaturamento.ts` soma `pedidos/vendas` por situação, "não NF-e" (hardcoded) |
| 3 | **Financeiro raso** | `consultarFinanceiro.ts` puxa `/contas/pagar` **sem filtro de situação (pago/aberto)** nem data server-side; hardcoda "não distingue pago/em aberto" |
| 4 | **Truncamento por paginação** | `blingClient.ts` `getAllPages` corta em 20 páginas × 100 = 2000 registros; `/contas` e `/produtos` sem filtro de data server-side → pega 2000 "quaisquer" |
| 5 | **Modelo fraco + loop curto** | default `gpt-4.1-mini`, `maxToolCalls = 8` |
| 6 | **Tools rígidas e pré-digeridas** | 9 tools retornam resumos fixos (top 10, arredondado); LLM nunca vê dado bruto |
| 7 | **Prompt e KB estreitos** | `conhecimento.md` diz "acesso em 4 áreas"; `systemPrompt.ts` manda "diga o que falta" |

**Sintomas confirmados nos prints:** (print 3) "não detalha CFOP nem distingue venda/bonificação em NF"
→ causa 1/2. (print 4) contas a pagar "não distingue o que foi pago ou está em aberto" → causa 3.

## 2. Objetivo / visão

Transformar o chatbot de 9 tools rígidas num **agente autônomo de gestão** — "quase um opencode, mas
100% voltado para gestão e análise do Bling". O agente planeja em múltiplos passos, compõe consultas à
API do Bling por conta própria (incluindo NF-e e financeiro com status), pagina sem truncar, cruza dados
e responde qualquer pergunta de gestão do café — sem inventar e sem dizer "não consigo" quando o dado
existe na API.

## 3. Decisões de arquitetura

| Decisão | Escolha | Porquê |
|---|---|---|
| **Base** | Purpose-built que **espelha o paradigma do opencode** (Session/Agent/Tool/Provider/Permission), **não** um fork do opencode-de-código | "100% gestão" fica mais limpo/seguro sem baggage de bash/edição/LSP/git; reaproveita base enxuta e testada |
| **Fundação do loop** | **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`) — mesma fundação provider-agnostic que o opencode usa | Loop multi-step maduro, streaming, tool-calling tipado (zod), troca de provider trivial |
| **Modelo** | **Claude Sonnet 4.x** default, configurável por env | Raciocínio forte para análise fiscal/financeira; ótimo custo/qualidade |
| **Acesso** | **Somente leitura** (enforced) | Segurança de produção; agente autônomo sem risco de efeito colateral no ERP |
| **Backend** | Mantém **Express + TypeScript** | Já funciona; só troca o miolo do agente |
| **Frontend** | Mantém **React + Vite + Tailwind + shadcn/ui**; qualquer alteração usa o skill `frontend-design` | Regra permanente de UI do produto |

## 4. Arquitetura de componentes

### 4.1 Provider layer (`src/agent/provider.ts` — novo)
- Abstrai o modelo via AI SDK. Default `@ai-sdk/anthropic` → `claude-sonnet-4-6` (id confirmado contra a doc do provider no TDD).
- Config por env: `AGENT_PROVIDER` (`anthropic` | `openai`), `AGENT_MODEL`, `ANTHROPIC_API_KEY`.
- Substitui o `openai` client hardcoded.

### 4.2 Agent loop (`src/agent/agentLoop.ts` — reescrito)
- Usa `streamText` do AI SDK com `tools` e `stopWhen: stepCountIs(N)` (N configurável, default **20**).
- **Streaming**: emite tokens + eventos de tool-call (início/fim/resumo) via SSE para a UI.
- Planeja → chama tools → observa → refina, autonomamente, até responder.
- Mensagem de limite só se estourar N passos (raro).

### 4.3 Tool system — o coração da correção

**Tier 1 — tools típadas e ricas** (cobrem 80% com ergonomia; retornam dado **rico, não pré-mastigado**):

| Tool | Cobertura | Mudança vs. atual |
|---|---|---|
| `bling_vendas` | pedidos de venda, ticket, agregações por período | dado mais rico |
| `bling_faturamento` | faturamento por **NF-e emitida** (real) **ou** por pedidos (proxy), à escolha | passa a poder usar NF-e |
| `bling_notas_fiscais` **(NOVO)** | NF-e por período: número, tipo (entrada/saída), natureza da operação, **CFOP por item**, itens, valores | **destrava print 3** |
| `bling_financeiro` | contas a pagar/receber com **filtro de situação (pago/aberto/parcial/cancelado)** e datas server-side | **destrava print 4** |
| `bling_estoque` | saldos, abaixo do mínimo, busca | mantém |
| `bling_producao` | ordens de produção por período/situação | mantém |
| `bling_produtos` | catálogo, preços/custos, busca | mantém |
| `bling_clientes` | contatos, maiores, busca | mantém |
| `bling_pedidos` | maiores, detalhe, por cliente | mantém |

**Tier 2 — escape hatch genérico** (`bling_consultar_api` — NOVO):
- Input: `{ path: string, params?: Record<string, string|number|Array<string|number>>, todasPaginas?: boolean, maxPaginas?: number }`.
- Deixa o agente consultar **qualquer endpoint de leitura** da API v3 que as tools típadas não cobrem.
- **Guard read-only**: só GET; `path` precisa casar com a whitelist de recursos de leitura (§4.5).
- Retorna JSON cru (array `data` + metadados de paginação, inclusive sinal **"há mais páginas"**).
- **É o que dá a autonomia estilo opencode**: o agente deixa de ser limitado ao que o autor previu.

**Contrato comum das tools:** todas retornam objeto com `{ dados, resumo?, paginacao?: { paginas, truncado: boolean } }`.
Nada de arredondar/cortar silenciosamente; se truncar por limite, sinaliza `truncado: true`.

### 4.4 Bling client hardening (`src/bling/blingClient.ts` + `endpoints.ts`)
- **Paginação honesta**: `getAllPages` passa a devolver `{ itens, truncado }`; `maxPaginas` configurável e default maior (**50**); nunca corta sem sinalizar.
- **Filtros server-side**: sempre que a API suportar (datas, `situacoes[]`, `tipo`, `idContato`), filtrar no servidor — não baixar 2000 e filtrar em memória.
- **Novos endpoints**: `/nfe` (lista + detalhe), `/contas/pagar` e `/contas/receber` com params de situação/data. *(Nomes exatos de params confirmados contra `developer.bling.com.br/referencia` no TDD.)*
- **Mantém** o throttle serializado (3 req/s) e o refresh single-flight de token — já robustos.

### 4.5 Permission / read-only guard (`src/bling/readOnlyGuard.ts` — novo)
- Camada estilo "permissions" do opencode. `BlingClient` **não** expõe métodos de escrita (POST/PUT/DELETE) — read-only por construção.
- O guard valida, na `bling_consultar_api`, que `path` casa com a whitelist de prefixos de leitura conhecidos e que não há verbo de escrita. Belt-and-suspenders.
- Whitelist: `/pedidos/vendas`, `/produtos`, `/estoques/saldos`, `/ordens-producao`, `/contatos`, `/contas/pagar`, `/contas/receber`, `/nfe`, `/categorias/*`, `/situacoes`, `/formas-pagamentos`, `/depositos` (lista ampliável).

### 4.6 System prompt + base de conhecimento (`src/agent/systemPrompt.ts` + `conhecimento.md`)
- Reescrever "capabilities-first": listar TODAS as áreas (vendas, faturamento, **NF-e/fiscal**, **financeiro pago/aberto**, estoque, produção, clientes, catálogo, pedidos).
- Instruir **autonomia**: planejar multi-step, paginar até ter o dado, cruzar fontes, distinguir venda×bonificação por **CFOP**, distinguir **pago×aberto**, usar `bling_consultar_api` quando faltar tool típada.
- Só dizer "não tenho" quando o dado **realmente** não existe na API.
- **Manter** o excelente conteúdo de domínio de café da `conhecimento.md`; corrigir só o trecho "4 áreas".

### 4.7 Web UI (`web/src/components/Chat.tsx` + `web/src/lib/api.ts`) — **usa skill `frontend-design`**
- Consumir o endpoint **streaming** (SSE): renderizar tokens conforme chegam.
- **Timeline de tool-calls**: mostrar "consultando NF-e…", "paginando contas a pagar (pág. 3)…", etc., para o usuário **ver o agente trabalhando** (feel opencode).
- Manter shadcn/ui e a identidade visual atual (tema café).

### 4.8 Sub-agentes (fase 2, opcional — fora do v1)
- Para análises pesadas ("análise completa do mês"), um planner dispara sub-tarefa focada (conceito "general subagent" do opencode). Documentado, não implementado no v1.

## 5. Cobertura de dados Bling (depois)

| Área | Endpoint(s) | Filtros server-side principais |
|---|---|---|
| Vendas/Pedidos | `/pedidos/vendas`, `/pedidos/vendas/{id}` | `dataInicial/Final`, `idsSituacoes[]` |
| Faturamento | via `/nfe` (real) ou `/pedidos/vendas` (proxy) | datas, tipo saída |
| **NF-e (NOVO)** | `/nfe`, `/nfe/{id}` | `dataEmissaoInicial/Final`, `tipo`, situação |
| **Financeiro** | `/contas/pagar`, `/contas/receber` | `situacoes[]` (pago/aberto/…), `dataVencimentoInicial/Final`, `dataEmissao...` |
| Estoque | `/estoques/saldos` (talvez `idsProdutos[]`) | por produto |
| Produção | `/ordens-producao` | datas, situação |
| Catálogo | `/produtos`, `/produtos/{id}` | busca, preço/custo |
| Clientes | `/contatos` | busca, tipo |

## 6. Fluxo de dados

```
chat web ──POST /api/chat (SSE)──▶ agentLoop (Claude Sonnet via AI SDK)
   ▲                                   │ planeja e compõe tool calls
   │ tokens + eventos de tool          ▼
   └──────────────── stream ◀── tools (tier1/tier2) ──▶ BlingClient
                                          (throttle 3req/s · paginação honesta ·
                                           filtros server-side · read-only guard)
                                                   │
                                                   ▼  Bling API v3
```

## 7. Contratos (TypeScript, resumo)

```ts
// Tool genérica (escape hatch)
interface ConsultarApiArgs { path: string; params?: Record<string, string|number|Array<string|number>>; todasPaginas?: boolean; maxPaginas?: number; }
interface ToolResult<T=unknown> { dados: T; resumo?: string; paginacao?: { paginas: number; truncado: boolean }; }

// Client
class BlingClient {
  get<T>(path: string, query?: Record<string, unknown>): Promise<T>;
  getAllPages<T>(path: string, query?, opts?): Promise<{ itens: T[]; truncado: boolean }>;
  // sem post/put/delete — read-only por construção
}
```

## 8. Segurança

- **Read-only enforced** por construção (sem métodos de escrita) + guard de whitelist na tool genérica.
- Tokens Bling continuam em `.bling-tokens.json` (gitignored); refresh automático.
- Auth do app por token Bearer; CORS por `CORS_ORIGIN`.
- Nunca versionar `.env` nem tokens.

## 9. Testes (Vitest, TDD)

- **Novos**: `bling_notas_fiscais` (parse de CFOP/itens), `bling_financeiro` com filtro de situação, guard read-only (rejeita verbo/path de escrita), paginação honesta (sinaliza `truncado`), `bling_consultar_api` respeitando whitelist, provider layer (troca de modelo), agentLoop multi-step com tools mockadas.
- **Mantidos/adaptados**: suíte atual (18 arquivos) migrada para os novos contratos.
- **Smoke manual** (credenciais reais): perguntar exatamente as perguntas dos prints 3 e 4 e conferir que agora respondem com CFOP/bonificação e pago/aberto.

## 10. Migração / compatibilidade

- Incremental: manter o endpoint atual `/api/chat` funcionando; adicionar variante streaming.
- Reescrita do miolo do agente sem quebrar auth/OAuth/token manager (já robustos).
- Preservar a `conhecimento.md` (só ajustar "4 áreas").

## 11. Fora de escopo (YAGNI)

Escrita no Bling · fork literal do opencode · WhatsApp · banco de dados / histórico persistente ·
multiusuário com permissões · sub-agentes (fase 2) · relatório agendado por e-mail.

## 12. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Nomes exatos de params/campos da API v3 (NF-e, contas) | Confirmar contra `developer.bling.com.br/referencia` no TDD; camada de endpoints isola isso |
| Custo de tokens (modelo forte + loop longo + dado bruto) | Sonnet (não Opus) por default; resumir dado volumoso antes de devolver ao LLM; `maxPaginas` sensato |
| Volume de dados estourando contexto | Tools resumem quando o array é grande; paginação sob demanda, não "tudo sempre" |
| Streaming quebrar a UI atual | Manter endpoint não-streaming como fallback; frontend com skill `frontend-design` |

## 13. Critérios de sucesso

1. Pergunta do **print 3** ("produtos em NF foram CFOP de venda ou bonificação?") → responde com breakdown por CFOP/natureza.
2. Pergunta do **print 4** ("total de contas pagas no mês passado?") → distingue **pago × em aberto**.
3. Nenhuma resposta "não tenho acesso" para dado que existe na API v3.
4. Sem truncamento silencioso: respostas sinalizam quando há mais dados.
5. Modelo Claude Sonnet, read-only, suíte Vitest verde, UI mostra o agente trabalhando.
