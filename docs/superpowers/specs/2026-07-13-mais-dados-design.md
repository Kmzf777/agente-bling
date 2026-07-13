# Ampliação de dados do facilitador — Clientes, Catálogo, Financeiro, Pedidos

- **Data:** 2026-07-13
- **Status:** Aprovado (execução autônoma pré-aprovada pelo usuário)

## Objetivo
Ampliar o que o **facilitador** consegue responder, de 4 para 8 áreas, adicionando 4 novas
ferramentas somente-leitura ao agente: **clientes, catálogo de produtos, financeiro
(a receber/pagar) e detalhes de pedidos**. Assim o gestor pode "perguntar qualquer coisa sobre
a empresa" e obter resposta direta.

## Endpoints reais confirmados (sondagem ao vivo)
- `GET /contatos` → `{ id, nome, numeroDocumento, telefone, situacao }`.
- `GET /contas/receber` → `{ id, situacao, vencimento, valor, dataEmissao, contato:{id,nome,tipo} }`.
- `GET /contas/pagar` → `{ id, situacao, vencimento, valor, contato:{id} }`.
- `GET /produtos` → inclui `preco`, `precoCusto`, `estoque.saldoVirtualTotal`.
- `GET /pedidos/vendas/{id}` → detalhe com `itens:[{ descricao, quantidade, valor, produto:{id} }]`, `total`, `contato:{nome}`, `numero`.

## Novas funções de endpoint (`src/bling/endpoints.ts`)
- `listarContatos(client)` → `/contatos` (paginado).
- `listarContasReceber(client)` → `/contas/receber` (paginado).
- `listarContasPagar(client)` → `/contas/pagar` (paginado).
- (`listarProdutos` e `obterPedidoVenda` já existem.)

## Novas ferramentas

### `consultar_clientes` (`src/tools/consultarClientes.ts`)
`args = { modo: "contagem" | "busca" | "maiores", termo?, periodo? }`.
- `contagem`: total de contatos.
- `busca(termo)`: filtra por nome (sem acento) → nome, documento, telefone.
- `maiores(periodo)`: cruza pedidos do período por `contato.id`, soma `total` → top 10 `{ nome, totalComprado, numeroPedidos }`.

### `consultar_catalogo` (`src/tools/consultarCatalogo.ts`)
`args = { modo: "contagem" | "busca" | "mais_caros" | "mais_baratos", termo? }`. Usa `listarProdutos`.
- Mapeia `{ id, nome, preco, precoCusto, saldo }`.
- `contagem`: total de produtos. `busca(termo)`: por nome. `mais_caros`/`mais_baratos`: ordena por `preco`, top 10.

### `consultar_financeiro` (`src/tools/consultarFinanceiro.ts`)
`args = { tipo: "a_receber" | "a_pagar", periodo? }`.
- Busca contas (receber/pagar); se `periodo`, filtra por `vencimento` no intervalo (código, `resolverPeriodo`); soma `valor` e conta.
- Retorna `{ tipo, periodo?, total, quantidade, itens: top 10 { valor, vencimento, contato } }`.
- **Transparência:** soma pelo vencimento no período; não distingue pago/em aberto (situação não é interpretada para evitar suposição). O prompt deve deixar isso claro se perguntado.

### `consultar_pedidos` (`src/tools/consultarPedidos.ts`)
`args = { modo: "maiores" | "detalhe" | "por_cliente", periodo?, numero?, cliente? }`.
- `maiores(periodo)`: pedidos do período ordenados por `total` desc, top 10 `{ numero, data, total, cliente }`.
- `detalhe(numero)`: acha o pedido pelo `numero` nos pedidos recentes → pega `id` → `obterPedidoVenda(id)` → `{ numero, total, cliente, itens:[{descricao, quantidade, valor}] }`.
- `por_cliente(cliente, periodo)`: pedidos do período cujo `contato.nome` contém o termo → lista `{ numero, data, total }`.

## Registro e prompt
- `src/agent/tools.ts`: adicionar as 4 ferramentas a `toolDefinitions` (formato OpenAI) e ao dispatcher `executarTool`. `ToolDeps` já tem `client`, `situacoesFaturado`, `hoje`.
- `src/agent/systemPrompt.ts`: atualizar a lista de áreas para incluir **clientes, catálogo, financeiro e pedidos** (para o agente saber que pode responder isso).

## Fora de escopo
- Escrita no Bling (segue 100% read-only). NF-e. Relatórios agendados. Interpretação de `situacao` do financeiro (apenas soma por vencimento).

## Testes
- Cada ferramenta com teste (mock do `client.getAllPages`/`get` com os campos reais).
- `tools.test.ts`: passa a esperar **9 ferramentas**.
- `systemPrompt.test.ts`: menciona "clientes"/"financeiro".
- Todos os testes verdes; `tsc --noEmit` limpo.
- Verificação final: probe ao vivo de cada nova ferramenta (controller).

## Critérios de sucesso
- O agente responde perguntas de clientes, catálogo, financeiro e pedidos com dados reais do Bling, de forma direta (facilitador).
