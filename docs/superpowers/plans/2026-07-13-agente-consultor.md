# Agente Consultor + Correções — Plano de Implementação

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Voltar os relatórios a funcionar (corrigir estoque/report), dar observabilidade, e transformar o agente num consultor de gestão embutindo `conhecimento.md` no prompt.

**Tech Stack:** Node+TS, vitest. Sem novas dependências.

---

### Task 1: `consultar_estoque` via `/produtos` (+ remover `/estoques/saldos`)
- **Files:** `src/tools/consultarEstoque.ts`, `src/bling/endpoints.ts`, `tests/consultarEstoque.test.ts`, `tests/endpoints.test.ts`.
- Reescrever `consultarEstoque` para usar só `listarProdutos` (`estoque.saldoVirtualTotal`, `estoque.minimo`). Filtro `abaixo_minimo` = `minimo>0 && saldo<minimo`; `busca`; `todos`.
- Remover `listarSaldosEstoque` de `endpoints.ts` e o teste correspondente em `endpoints.test.ts`.
- Atualizar `consultarEstoque.test.ts` (mock só `/produtos`).
- **Verificação:** implementação deve sondar 1 produto real p/ confirmar se `estoque.minimo` vem na lista; se não vier, `abaixo_minimo` retorna vazio (ok, documentado).
- `npm test` verde; commit.

### Task 2: `gerar_relatorio_diario` resiliente
- **Files:** `src/tools/relatorioDiario.ts`, `tests/relatorioDiario.test.ts`.
- Envolver cada seção em `seguro()` (retorna dados OU `{erro}`); o relatório sempre retorna.
- Teste: quando uma seção lança, o relatório ainda traz as demais + `{erro}` na que falhou.
- `npm test` verde; commit.

### Task 3: Log de erros de ferramenta no loop
- **Files:** `src/agent/agentLoop.ts`.
- No `catch` da execução da ferramenta, `console.error(...)` antes de montar o `content` de erro.
- `npm test` verde; commit.

### Task 4: `systemPrompt` consultor + base de conhecimento
- **Files:** `src/agent/systemPrompt.ts`, `tests/systemPrompt.test.ts`. (Usa `src/agent/conhecimento.md`, já criado.)
- Ler `conhecimento.md` com `readFileSync(new URL("./conhecimento.md", import.meta.url))` no load do módulo; montar prompt de consultor (interpretar, comparar, 1–3 ações, pergunta de acompanhamento, transparência, números só das ferramentas) + anexar o conhecimento.
- Teste: prompt contém data, "consultor", "invente", "ferramentas", "perecível".
- `npm test` + `npx tsc --noEmit` verdes; commit.

### Task 5: Verificação final (controller)
- `npm test` (todos) + `tsc`.
- Re-rodar o diagnóstico ao vivo: confirmar que `consultar_estoque` não dá mais 400 e `gerar_relatorio_diario` retorna com sucesso.
