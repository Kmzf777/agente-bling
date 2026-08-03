# Design — Quantidade vendida por CFOP e compras por item

**Data:** 2026-08-03
**Status:** Aprovado (usuário pré-aprovou spec + plano)

## Problema

No Telegram, ao perguntar "quantidade vendida em julho" filtrando por CFOP de venda
(5101/5102/6101/6102), excluindo bonificação, e ao pedir "quantidade de produtos comprados
por ordem de compra em julho", o agente **não deu conta**. Ele chegou a dizer que "a API do
Bling não retorna o CFOP de forma estruturada" e caiu no escape hatch sem sucesso.

### Causa raiz (diagnóstico do código)

1. **Teto de 80 notas para buscar CFOP por item.** `src/tools/consultarNotasFiscais.ts` tem
   `MAX_DETALHE = 80`. A lista da API v3 (`/nfe`, `/nfce`) **não traz os itens/CFOP** — eles só
   vêm ao abrir cada nota (`GET /nfe/{id}` ou `/nfce/{id}`). O código abre nota a nota mas para
   em 80. Num mês cheio há muito mais que 80 notas → a maioria fica sem CFOP → total errado.
   Foi o que fez o bot ver dados furados e concluir (erroneamente) que a API não expõe CFOP.

2. **Só devolve valor (R$) por CFOP.** A tool calcula `quantidade` por CFOP internamente, mas
   não há filtro por um conjunto de CFOPs nem quebra **por produto**, e o modelo não soube somar
   a quantidade dos 4 CFOPs de venda.

3. **Compras por item não existem.** `consultarProducao` usa `/pedidos/compras` mas só soma o
   `total` (valor) dos pedidos da "Fabrica" — não a **quantidade por item**, e não cobre
   compras de fornecedores externos (matéria-prima). O `/compras` que o bot tentou no escape
   hatch é caminho errado (o correto é `/pedidos/compras`).

**Conclusão:** não é limitação da API do Bling. É o teto de 80 + falta de agregação por
quantidade item a item (notas e compras).

## Decisões do usuário

- **Métrica de vendas:** unidades **e** valor (R$), com quebra por **CFOP** e por **produto**.
- **Compras:** **todas** as ordens de compra do mês, quantidade por item, separando
  **Fabrica (produção)** de **fornecedores externos (matéria-prima)**.
- **Precisão x velocidade:** **completo, mesmo lento**. Buscar 100% das notas/pedidos do período
  (sem teto de 80). Pode levar 1–3 min; o agente avisa que está processando.

## Abordagem escolhida (A)

Turbinar as ferramentas típadas, seguindo o padrão já existente (uma tool por assunto).

### 1. `consultar_notas_fiscais` (revisar `src/tools/consultarNotasFiscais.ts`)

- **Remover o teto de 80.** Buscar o detalhe de **todas** as notas que vierem sem itens na
  lista. Manter um teto de segurança alto **apenas** como guarda contra runaway (ex.:
  `MAX_DETALHE = 2000`); se for excedido, marcar `paginacao.truncado = true` e explicar na
  `observacao`. As chamadas já são serializadas/espacadas pelo `BlingClient` (throttle ~400ms),
  então não há risco de estourar o rate limit — só demora.
- **Novo argumento opcional `cfops?: string[]`.** Quando presente, o resultado inclui um bloco
  `filtro` com o total de **quantidade** e **valor** somados **apenas** desses CFOPs, além da
  quebra por CFOP dentro do filtro. Sem o argumento, comportamento atual (todos os CFOPs).
- **Nova quebra `porProduto`.** Para cada produto (descrição/`codigo`), somar `quantidade` e
  `valor`, respeitando o filtro de CFOP quando informado. Ordenado por quantidade desc, limitado
  aos top N (ex.: 50) para não estourar o contexto do modelo.
- **Manter** `porCfop`, `totalVenda`, `totalBonificacao`, `totalOutras` (não quebrar testes
  existentes) e a classificação `classificarCfop`.
- **Saída (campos novos, aditivos):**
  - `porCfop[]`: `{ cfop, categoria, valor, quantidade, itens }` (já existe; garantir `quantidade`).
  - `porProduto[]`: `{ descricao, codigo?, quantidade, valor, itens }`.
  - `filtro?`: `{ cfops, quantidade, valor, porCfop: [...] }` (só quando `cfops` for passado).
  - `paginacao.truncado` reflete truncamento de lista **ou** do teto de detalhe.

### 2. `consultar_compras` (novo — `src/tools/consultarCompras.ts` + registro em `tools.ts`)

- Lista `/pedidos/compras` do período (via `listarPedidosCompra`).
- Abre cada pedido (`GET /pedidos/compras/{id}`) para obter os itens (mesma estratégia da NF:
  só busca detalhe quando a lista não traz itens; teto de segurança alto).
- Agrega **quantidade + valor por produto**.
- Classifica cada pedido em **`producao`** (contato = Fabrica, mesma lógica de
  `consultarProducao`: casa por `contatoId` e fallback por nome "fabrica") ou **`externo`**.
- **Saída:**
  - `periodo`
  - `totalPedidos`, `pedidosProducao`, `pedidosExterno`
  - `producao`: `{ quantidadeTotal, valorTotal, porProduto: [...] }`
  - `externo`: `{ quantidadeTotal, valorTotal, porProduto: [...] }`
  - `paginacao.truncado`
  - `observacao` explicando a separação Fabrica x externo.
- **Deps:** `{ client, hoje?, producaoContatoId? }` (reaproveita `deps.producaoContatoId` já
  existente em `ToolDeps`).

### 3. Registro e orientação do modelo

- Registrar `consultar_compras` em `src/agent/tools.ts` com descrição clara (quantidade por
  item de pedidos de compra; separa produção de matéria-prima; pode demorar em mês cheio).
- Ajustar a descrição de `consultar_notas_fiscais` para mencionar o filtro por CFOP e a quebra
  por produto (unidades + valor).
- Uma linha em `src/agent/systemPrompt.ts` (ou `conhecimento`) orientando: para perguntas de
  CFOP/quantidade vendida use `consultar_notas_fiscais` (com `cfops` quando o usuário listar);
  para quantidade comprada/produzida use `consultar_compras`; **não** desistir/cair no escape
  hatch — essas tools são completas mesmo que demorem.

### 4. Consistência do escape hatch (menor)

- Adicionar `/nfce` a `PREFIXOS_LEITURA` em `src/bling/readOnlyGuard.ts` (hoje só `/nfe` é
  permitido; `/nfce` não casa o prefixo). `/pedidos/compras/{id}` já é permitido pelo prefixo
  `/pedidos/compras`.

## Fluxo de dados

```
Pergunta CFOP/quantidade vendida
  → consultar_notas_fiscais({ periodo, cfops:["5101","5102","6101","6102"] })
    → listarNotasFiscais + listarNotasConsumidor (lista, sem itens)
    → para cada nota sem itens: GET /nfe/{id} ou /nfce/{id} (serializado, ~400ms)
    → agrega por CFOP e por produto; aplica filtro cfops
    → { filtro:{quantidade,valor,porCfop}, porProduto, porCfop, totais }

Pergunta quantidade comprada em julho
  → consultar_compras({ periodo })
    → listarPedidosCompra (lista)
    → para cada pedido sem itens: GET /pedidos/compras/{id}
    → agrega por produto; classifica producao x externo
    → { producao:{...}, externo:{...}, totais }
```

## Tratamento de erros

- Falha ao abrir uma nota/pedido individual: `catch` silencioso (mantém o header sem itens),
  como já é feito hoje. Se muitas falharem, o total sai menor — aceitável e sinalizado por
  `truncado` quando aplicável.
- 429/401 já são tratados no `BlingClient` (retry com backoff / refresh de token).
- Teto de segurança excedido → `truncado = true` + `observacao` pedindo período menor.

## Testes (vitest, seguindo os mocks existentes)

- `consultarNotasFiscais.test.ts` (estender):
  - Filtro `cfops` soma quantidade + valor só dos CFOPs pedidos.
  - `porProduto` agrega por descrição.
  - Busca detalhe de **mais de 80** notas (sem teto de 80) — mock com >80 notas sem itens,
    verificar que todas tiveram o detalhe buscado / o total bate.
- `consultarCompras.test.ts` (novo):
  - Agrega quantidade por produto.
  - Separa producao (Fabrica por ID e por nome) de externo.
  - Busca detalhe quando a lista não traz itens.
- `readOnlyGuard.test.ts`: `/nfce` e `/nfce/{id}` agora permitidos.
- `tools.test.ts`: `consultar_compras` registrada.

## Fora de escopo

- Cache/persistência (usuário escolheu "completo mesmo lento", não cache).
- UI nova no frontend (as respostas continuam via texto do agente).
- Escrita no Bling (agente permanece read-only).

## Riscos

- **Tempo de resposta:** mês cheio pode levar 1–3 min. O canal Telegram/web já mostra
  "Consultando…"; validar que não estoura timeout de webhook/HTTP em produção. Se estourar,
  tratar como follow-up (não bloqueia esta entrega).
