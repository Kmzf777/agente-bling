# Agente de IA para consulta ao Bling — Café Canastra (MVP)

- **Data:** 2026-07-11
- **Status:** Aprovado (spec + plano pré-aprovados pelo usuário)
- **Autor:** Rafael (Nutrimatic Inteligência) + Claude

## 1. Contexto e objetivo

Empresa de café que usa o ERP **Bling** para gerir operação e comercial. O objetivo é um
**agente de IA acessível por um site simples de chat**, onde o gestor pergunta em linguagem
natural sobre o negócio e recebe respostas fundamentadas em dados **ao vivo** do Bling, além
de um **relatório diário sob demanda**.

WhatsApp era a ideia original, mas foi **adiado**: o MVP é um site com interface de chat.

## 2. Escopo do MVP

### Dentro do escopo (4 domínios encadeados: Produção → Estoque → Vendas → Faturamento)
- **Vendas:** quanto foi vendido por período, nº de pedidos, ticket médio, produtos mais vendidos (best-effort).
- **Faturamento:** receita por período (aproximada por pedidos com situação "faturado"), comparação com período anterior.
- **Estoque:** saldos atuais, produtos abaixo do mínimo, busca de produto por nome.
- **Produção:** ordens de produção por período/situação, quantidades produzidas.
- **Relatório diário sob demanda:** resumo do dia combinando os quatro domínios.

### Fora do escopo (YAGNI — explicitamente adiado)
WhatsApp · banco de dados · histórico persistente · relatório automático agendado/por e-mail ·
NF-e (emissão/consulta fiscal) · Financeiro (contas a pagar/receber) · múltiplos usuários com
permissões · **qualquer operação de escrita/alteração no Bling** (o agente é 100% somente-leitura).

## 3. Usuários e autenticação
- **Uso:** o gestor (e, no máximo, poucas pessoas de confiança compartilhando a mesma senha).
- **Login do site:** senha única em `APP_PASSWORD` (`.env`). Backend valida e emite **cookie de
  sessão assinado** (HttpOnly, `SameSite=Lax`) usando `SESSION_SECRET`. Sem cadastro, sem banco.

## 4. Arquitetura

### Componentes
```
┌─────────────────────┐        ┌───────────────────────────────────┐
│  Frontend (React)   │        │        Backend (Node + TS)         │
│  Vite+Tailwind+shadcn│◄─────►│                                    │
│  • Tela de login     │  HTTPS │  • /api/login   (sessão)          │
│  • UI de chat        │        │  • /api/chat    (orquestrador)    │
│  • guarda histórico  │        │  • Agente Claude (tool use)       │
│    da conversa       │        │  • Cliente Bling (+ token manager)│
└─────────────────────┘        │  • Registro de ferramentas        │
                               └──────────┬─────────────┬──────────┘
                                          │             │
                                  ┌───────▼───┐   ┌─────▼───────┐
                                  │ API Claude │   │  API Bling  │
                                  │(raciocínio)│   │   (dados)   │
                                  └────────────┘   └─────────────┘
```

### Fluxo de uma mensagem
1. Frontend envia `{ mensagens: Historico[] }` para `POST /api/chat` (com cookie de sessão).
2. Backend chama Claude com o histórico + **definições das ferramentas** + prompt de sistema
   (que inclui a data/hora atual em `America/Sao_Paulo`).
3. Se Claude retorna `tool_use`, o backend executa a ferramenta (consulta **read-only** ao Bling),
   trata paginação/limite/erros, e devolve o `tool_result`.
4. Loop de tool use até o Claude produzir a resposta final em texto (com **teto de N chamadas**).
5. Backend retorna a resposta; o frontend anexa ao histórico local e re-envia nas próximas mensagens.
6. **Sem estado no servidor**: o histórico vive no navegador (sem banco).

## 5. Ferramentas do agente (contrato)

Todas **somente-leitura**. Datas resolvidas em código (fuso `America/Sao_Paulo`) via util
`resolverPeriodo(periodo) -> { dataInicial, dataFinal }` (formato `YYYY-MM-DD`).

`periodo` ∈ `hoje | ontem | esta_semana | semana_passada | este_mes | mes_passado | personalizado`
(com `dataInicial`/`dataFinal` quando `personalizado`).

| Ferramenta | Entrada | Fonte Bling | Saída (resumo) |
|---|---|---|---|
| `consultar_vendas` | `{ periodo, dataInicial?, dataFinal? }` | `GET /pedidos/vendas` (filtro data) | nº pedidos, valor total, ticket médio, top produtos (best-effort, com teto de pedidos lidos) |
| `consultar_faturamento` | `{ periodo, ... , comparar_anterior? }` | `GET /pedidos/vendas` filtrado por situação faturada (IDs via `.env`) | faturamento do período, nº pedidos faturados, comparação opcional |
| `consultar_estoque` | `{ filtro: abaixo_minimo\|todos\|busca, termo? }` | `GET /produtos` (+ `GET /estoques/saldos`) | saldos atuais, itens abaixo do mínimo, resultado de busca |
| `consultar_producao` | `{ periodo?, situacao?: abertas\|concluidas\|todas }` | `GET /ordens-producao` (paginado 100) | ordens no filtro, quantidades produzidas |
| `gerar_relatorio_diario` | `{ data?: hoje\|ontem }` | chama as ferramentas acima | resumo estruturado (vendas + faturamento + estoque crítico + produção do dia) |

**Notas de negócio conhecidas (transparência):**
- *Faturamento ≈ pedidos com situação faturada*, não NF-e. As "situações" do Bling são
  **customizáveis por conta**; os IDs corretos ficam em `BLING_SITUACAO_FATURADO_IDS` (`.env`),
  a serem confirmados durante a implementação.
- *Top produtos* pode exigir ler itens pedido-a-pedido (custoso). No MVP é **best-effort** com
  teto de pedidos lidos; refino posterior possível.
- *Produção*: endpoint confirmado como existente; caminho exato (`/ordens-producao` vs variação)
  e campos devem ser validados contra a doc/resposta real na task correspondente.

## 6. Integração com o Bling

- **URL-base:** `https://api.bling.com.br/Api/v3` (confirmada).
- **OAuth 2.0 (authorization_code):**
  - Fluxo único de setup: rota/script `bling:auth` gera a URL de consentimento; usuário aprova no
    navegador; callback troca `code` por tokens (POST em `/oauth/token` com header
    `Authorization: Basic base64(client_id:client_secret)`, `grant_type=authorization_code`).
  - *A confirmar na task de OAuth contra a doc oficial:* URLs exatas de `authorize` e `token`.
- **Token manager (sem banco):** persiste `access_token`, `refresh_token`, `expires_at` em
  `.bling-tokens.json` (gitignored). Renova **proativamente** (antes de expirar, lendo `expires_in`)
  e **reativamente** (retry único em 401 via `grant_type=refresh_token`). Refresh token dura ~30 dias.
- **Rate limiting:** limites reais 3 req/s · 600/10s · 120 mil/dia · `/oauth/token` 20/60s.
  Cliente com **fila/throttle** (≤3 req/s) e **backoff** em 429.
- **Paginação:** cliente percorre páginas (`pagina`/`limite`) até um teto sensato por consulta.

## 7. Integração com o Claude (Anthropic SDK)
- **Modelo:** padrão `claude-haiku-4-5` (rápido, ótimo em tool use, barato); configurável via
  `ANTHROPIC_MODEL` (ex.: subir para `claude-sonnet-4-6`).
- **Tool use:** definições das 5 ferramentas passadas a cada chamada.
- **Prompt caching:** system prompt + definições de ferramentas marcados como cacheáveis para cortar custo.
- **Prompt de sistema:** papel (assistente de gestão do café), data/hora atual (`America/Sao_Paulo`),
  regras (só usar dados das ferramentas; nunca inventar números; deixar claras aproximações;
  responder em PT-BR, conciso e orientado a gestão).
- **Guardrails:** teto de chamadas de ferramenta por mensagem (ex.: 8) para evitar loop/custo.

## 8. Frontend
- **Stack:** React + Vite + TypeScript + Tailwind + **shadcn/ui**.
- **REGRA OBRIGATÓRIA:** qualquer trabalho de frontend **deve** invocar a skill `frontend-design`
  e usar **componentes shadcn/ui** (nada de HTML/CSS genérico "de IA"). Interface polida e distinta.
- **Telas:** (1) Login (senha) e (2) Chat — histórico de mensagens, campo de entrada, indicador de
  "pensando", botão/atalho "Relatório de hoje". Estado do histórico no cliente.
- **Build/serve:** em produção o backend serve os estáticos do build do Vite; em dev, Vite + proxy `/api`.

## 9. Segurança
- Segredos só no `.env`; entregar `.env.example` e `.gitignore` (protegendo `.env` e `.bling-tokens.json`).
- Sessão via cookie assinado HttpOnly; todas as rotas `/api/*` (exceto login) exigem sessão válida.
- Ferramentas **somente-leitura** — nenhuma rota de escrita ao Bling existe no código.
- Variáveis: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`,
  `BLING_REDIRECT_URI`, `BLING_SITUACAO_FATURADO_IDS`, `APP_PASSWORD`, `SESSION_SECRET`, `PORT`.

## 10. Tratamento de erros
- **Bling 429/limite:** throttle + backoff; se persistir, mensagem clara "limite do Bling atingido".
- **Token inválido/expirado:** refresh automático; se refresh falhar, instrução para re-autenticar.
- **Sem dados no período:** ferramenta retorna vazio explícito → Claude responde amigável.
- **Erro de API/LLM:** mensagem amigável ao usuário + log detalhado no servidor (sem vazar segredos).

## 11. Estrutura de pastas
```
src/
  server.ts            → Express, rotas, login/sessão, serve estáticos
  config.ts            → carga/validação de env
  agent/
    claudeClient.ts    → wrapper Anthropic + loop de tool use + caching
    tools.ts           → registro/definições das ferramentas (schema JSON)
    systemPrompt.ts
  bling/
    tokenManager.ts    → persistência + refresh de token (.bling-tokens.json)
    blingClient.ts     → HTTP, throttle, paginação, tratamento de erro
    endpoints.ts       → funções por recurso (vendas, estoque, produtos, produção)
  tools/
    consultarVendas.ts  consultarFaturamento.ts  consultarEstoque.ts
    consultarProducao.ts relatorioDiario.ts
  util/
    periodo.ts         → resolverPeriodo() (fuso America/Sao_Paulo)
web/                   → app React (Vite + Tailwind + shadcn): login + chat
tests/                 → testes unitários
.env.example  .gitignore  package.json  tsconfig.json
```

## 12. Estratégia de testes (TDD onde importa)
- **Unit:** `resolverPeriodo` (todos os períodos, fuso, viradas de mês/semana); formatação de saída
  de cada ferramenta; `tokenManager` (refresh proativo/reativo, persistência) com HTTP mockado;
  `blingClient` (paginação, throttle, 429/401) com respostas mockadas.
- **Orquestração:** `claudeClient` com cliente Anthropic mockado — dado um `tool_use`, confirma que
  a ferramenta certa é chamada com os argumentos certos e que o `tool_result` volta ao modelo.
- **Smoke manual (fim):** uma consulta real **read-only** ao Bling para validar credenciais/paginação.

## 13. Riscos e pontos a verificar durante a implementação
1. URLs exatas de OAuth `authorize`/`token` (confirmar na doc oficial).
2. IDs das situações "faturado" da conta (configurar em `.env`).
3. Caminho/campos exatos de `ordens-producao` e de `estoques/saldos` na v3.
4. Custo de "top produtos" (itens por pedido) — manter best-effort com teto.

## 14. Critérios de sucesso do MVP
- Login funciona; sessão protege as rotas.
- OAuth do Bling concluído uma vez; token renova sozinho depois.
- O agente responde corretamente perguntas reais nas 4 áreas e gera o relatório diário sob demanda,
  **sempre com dados vindos do Bling** (sem inventar), em PT-BR.
- Frontend em shadcn/ui, agradável e responsivo.
- Nenhuma operação de escrita ao Bling em nenhum caminho de código.
