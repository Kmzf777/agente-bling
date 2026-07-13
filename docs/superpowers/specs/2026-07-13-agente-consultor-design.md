# Agente Consultor de Gestão + Correção das Ferramentas Bling

- **Data:** 2026-07-13
- **Status:** Aprovado (spec + plano pré-aprovados pelo usuário)

## Contexto (do diagnóstico ao vivo)
Com o Bling conectado, um diagnóstico real revelou:
- **Vendas** e **faturamento** funcionam (dados reais retornando).
- **Produção** funciona, mas a conta **não tem ordens de produção** (`/ordens-producao` → vazio) → sempre 0.
- **Estoque QUEBRA:** `consultar_estoque` chama `GET /estoques/saldos`, que retorna **HTTP 400** (exige parâmetros). Como `gerar_relatorio_diario` chama o estoque, **o relatório inteiro falha** — causa raiz de "todos os relatórios falhando".
- O agente responde de forma **rasa** (só números, sem interpretação de gestão).

## Objetivo
1. **Corrigir e blindar** as ferramentas para os relatórios voltarem a funcionar.
2. **Transformar o agente num consultor de gestão especialista**, embutindo uma base de conhecimento de café especial no prompt.

## Parte A — Correções e robustez

### A1. `consultar_estoque` via `/produtos` (remove o 400)
- O endpoint `GET /produtos` **já retorna o saldo** em `estoque.saldoVirtualTotal` (confirmado no diagnóstico). Reescrever `consultarEstoque` para usar **somente `/produtos`**: `saldo = estoque.saldoVirtualTotal`, `minimo = estoque.minimo` (se presente).
- **Remover** a chamada a `/estoques/saldos` e a função `listarSaldosEstoque` de `endpoints.ts` (e seu teste).
- Filtro `abaixo_minimo`: `minimo > 0 && saldo < minimo` (honesto — se a conta não configura mínimo, retorna poucos/nenhum). `busca` por nome/código mantém. `todos` limita a 100.
- ⚠️ Implementação deve **sondar um produto completo** (`GET /produtos/{id}` e a lista) para confirmar se `estoque.minimo` vem na listagem; se não vier, o filtro simplesmente retorna vazio (documentar), sem quebrar.

### A2. `gerar_relatorio_diario` resiliente
- Trocar `Promise.all` por execução tolerante a falhas: cada seção (vendas, faturamento, estoqueCritico, producao) retorna **seus dados OU `{ erro }`**, e o relatório **sempre retorna**. Assim, a falha de uma seção não derruba o relatório inteiro.

### A3. Observabilidade no loop do agente
- Em `agentLoop.ts`, no `catch` da execução de ferramenta, adicionar `console.error` com o nome da ferramenta e o erro (para aparecer no terminal do backend). Mantém o `tool_result` com o erro para o modelo.

## Parte B — Conhecimento e persona de consultor

### B1. Base de conhecimento
- Arquivo `src/agent/conhecimento.md` (já criado a partir da pesquisa): café perecível, rendimento da torra (~18–22%), produção puxada, giro de estoque, curva ABC, ticket médio, sazonalidade, CMV/margem/ponto de equilíbrio, fluxo de caixa, e uma tabela causa→ação. Mapeado às 4 áreas do Bling.

### B2. `systemPrompt.ts` — persona + conhecimento
- Ler `conhecimento.md` (via `readFileSync(new URL("./conhecimento.md", import.meta.url))`, uma vez no carregamento do módulo).
- Persona: **consultor de gestão da Canastra**. Regras:
  - Responder em PT-BR; números **só** das ferramentas (nunca inventar/estimar sem fonte).
  - Não entregar só o número: **interpretar, comparar** com período anterior quando útil, apontar causa provável, recomendar **1–3 ações** e fechar com **uma pergunta de acompanhamento**.
  - **Transparência** sobre dado ausente/aproximado (ex.: conta sem ordens de produção; faturamento aproximado por pedidos, não NF-e).
  - Usar a base de conhecimento **para interpretar**, jamais para inventar números.
  - Manter data atual (America/Sao_Paulo) e formatação em R$.
- **Custo:** o prompt cresce (~1.900 palavras). O prompt caching automático da OpenAI absorve boa parte; aceitável para uma ferramenta de gestão.

## Fora de escopo (YAGNI)
- Faturamento por NF-e; configurar `BLING_SITUACAO_FATURADO_IDS` (ação do usuário — documentado; hoje o faturamento soma todos os pedidos do período).
- RAG/vector DB (conhecimento vai direto no prompt).
- Alterar frontend, auth, deploy, ou o comportamento das ferramentas que já funcionam (vendas/faturamento/produção).

## Testes
- `consultarEstoque`: mock de `/produtos` com `estoque.saldoVirtualTotal`/`minimo` → filtra abaixo do mínimo e busca por nome; **sem** depender de `/estoques/saldos`.
- `relatorioDiario`: quando uma seção lança erro, o relatório ainda retorna com `{ erro }` naquela seção e dados nas demais.
- `systemPrompt`: contém a data, as regras de persona (ex.: "consultor", "ações") e trecho do conhecimento (ex.: "perecível" ou "ticket médio").
- `endpoints`: remover o teste de `listarSaldosEstoque`.
- Todos os testes existentes seguem verdes; `tsc --noEmit` limpo.

## Critérios de sucesso
- `gerar_relatorio_diario` retorna com sucesso (com dados reais nas seções que a conta tem).
- `consultar_estoque` não dá mais 400.
- As respostas do agente passam a **interpretar** os números com lente de gestão de café, recomendando ações e fechando com uma pergunta.
- Erros de ferramenta aparecem no terminal do backend.
