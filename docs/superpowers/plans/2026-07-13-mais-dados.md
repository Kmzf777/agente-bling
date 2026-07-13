# Ampliação de dados — Plano de Implementação

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** 4 novas ferramentas read-only (clientes, catálogo, financeiro, pedidos), registradas e refletidas no prompt do facilitador.

---

### Task 1: Endpoints
- `src/bling/endpoints.ts`: `listarContatos`, `listarContasReceber`, `listarContasPagar` (getAllPages). Teste em `tests/endpoints.test.ts`.

### Task 2: `consultar_clientes`
- `src/tools/consultarClientes.ts` (contagem/busca/maiores) + teste.

### Task 3: `consultar_catalogo`
- `src/tools/consultarCatalogo.ts` (contagem/busca/mais_caros/mais_baratos) + teste.

### Task 4: `consultar_financeiro`
- `src/tools/consultarFinanceiro.ts` (a_receber/a_pagar, filtro por vencimento) + teste.

### Task 5: `consultar_pedidos`
- `src/tools/consultarPedidos.ts` (maiores/detalhe/por_cliente) + teste.

### Task 6: Registro + prompt
- `src/agent/tools.ts`: registrar as 4 (formato OpenAI) + dispatcher. `tests/tools.test.ts` → 9 ferramentas.
- `src/agent/systemPrompt.ts`: incluir as novas áreas. `tests/systemPrompt.test.ts` menciona "clientes".

### Task 7: Verificação (controller)
- `npm test` + `tsc`; probe ao vivo de cada nova ferramenta.
