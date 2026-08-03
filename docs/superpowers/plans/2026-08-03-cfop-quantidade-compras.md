# CFOP/Quantidade Vendida e Compras por Item — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o agente responder corretamente "quantidade + valor vendidos por CFOP" (buscando todas as notas do período, sem teto de 80) e "quantidade comprada por item" (nova tool de compras, separando produção da Fabrica de fornecedores externos).

**Architecture:** Turbinar a tool típada `consultarNotasFiscais` (remover teto de detalhe, filtro por CFOP, quebra por produto) e criar a tool `consultarCompras` (agrega itens de pedidos de compra). Registrar no mapa de tools e orientar o modelo no system prompt. Segue o padrão existente: uma função pura por assunto em `src/tools/`, testada com client mockado (vitest), registrada em `src/agent/tools.ts`.

**Tech Stack:** Node + TypeScript, Vercel AI SDK (`tool`/`zod`), vitest. API Bling v3 (read-only via `BlingClient`).

---

## File Structure

- **Modify** `src/tools/consultarNotasFiscais.ts` — remover `MAX_DETALHE = 80` (teto de segurança alto), aceitar `cfops?: string[]`, devolver `porProduto` e bloco `filtro`.
- **Create** `src/tools/consultarCompras.ts` — agrega quantidade/valor por produto dos pedidos de compra; separa `producao` (Fabrica) x `externo`.
- **Modify** `src/agent/tools.ts` — registrar `consultar_compras`, atualizar descrições e schema (`cfops`).
- **Modify** `src/bling/readOnlyGuard.ts` — adicionar `/nfce` aos prefixos de leitura.
- **Modify** `src/agent/systemPrompt.ts` — orientar uso das tools (CFOP com `cfops`, compras por item, não desistir).
- **Modify** `tests/consultarNotasFiscais.test.ts` — filtro cfops, porProduto, >80 notas.
- **Create** `tests/consultarCompras.test.ts` — agregação por produto e split producao/externo.
- **Modify** `tests/readOnlyGuard.test.ts` — `/nfce` permitido.
- **Modify** `tests/tools.test.ts` — `consultar_compras` na lista.

**Comando de teste do projeto:** `npm test` (vitest). Para um arquivo: `npx vitest run tests/<arquivo>.test.ts`.

---

## Task 1: `consultarNotasFiscais` — remover teto de 80 e completar por produto/CFOP

**Files:**
- Modify: `src/tools/consultarNotasFiscais.ts`
- Test: `tests/consultarNotasFiscais.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do `describe("consultarNotasFiscais", ...)` em `tests/consultarNotasFiscais.test.ts`:

```typescript
  it("filtra por lista de CFOPs (quantidade + valor) e ignora o resto", async () => {
    const client = clienteNotas({
      "/nfe": [
        nf([{ descricao: "Café A", codigo: "A", cfop: "5101", valor: 100, quantidade: 10 }]),
        nf([{ descricao: "Café B", codigo: "B", cfop: "6102", valor: 200, quantidade: 5 }]),
        nf([{ descricao: "Remessa", cfop: "5915", valor: 999, quantidade: 100 }]),
        nf([{ descricao: "Brinde", cfop: "5910", valor: 30, quantidade: 3 }]),
      ],
    });
    const r: any = await consultarNotasFiscais(
      { client },
      { periodo: "mes_passado", cfops: ["5101", "5102", "6101", "6102"] },
      new Date("2026-07-15"),
    );
    expect(r.filtro.cfops).toEqual(["5101", "5102", "6101", "6102"]);
    expect(r.filtro.quantidade).toBe(15); // 10 (5101) + 5 (6102)
    expect(r.filtro.valor).toBe(300); // 100 + 200 (NÃO inclui remessa nem brinde)
    expect(r.filtro.porCfop.find((c: any) => c.cfop === "5101").quantidade).toBe(10);
  });

  it("quebra por produto (quantidade + valor agregados por descrição)", async () => {
    const client = clienteNotas({
      "/nfe": [
        nf([{ descricao: "Café A", cfop: "5102", valor: 100, quantidade: 2 }]),
        nf([{ descricao: "Café A", cfop: "5102", valor: 50, quantidade: 1 }]),
        nf([{ descricao: "Café B", cfop: "5102", valor: 40, quantidade: 4 }]),
      ],
    });
    const r: any = await consultarNotasFiscais({ client }, { periodo: "mes_passado" }, new Date("2026-07-15"));
    const cafeA = r.porProduto.find((p: any) => p.descricao === "Café A");
    expect(cafeA.quantidade).toBe(3); // 2 + 1
    expect(cafeA.valor).toBe(150);
    expect(r.porProduto[0].descricao).toBe("Café A"); // ordenado por quantidade desc
  });

  it("busca o detalhe de MAIS de 80 notas (sem teto de 80)", async () => {
    const notas = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, numero: String(i + 1), dataEmissao: "2026-06-10" }));
    let detalhes = 0;
    const client = clienteNotas(
      { "/nfe": notas },
      async (path: string) => {
        detalhes++;
        return { data: { id: 1, itens: [{ descricao: "Café A", cfop: "5102", valor: 10, quantidade: 1 }] } };
      },
    );
    const r: any = await consultarNotasFiscais({ client }, { periodo: "mes_passado" }, new Date("2026-07-15"));
    expect(detalhes).toBe(120); // todas as 120 tiveram o detalhe buscado, não só 80
    expect(r.totalVenda).toBe(1200); // 120 * 10
    expect(r.paginacao.truncado).toBe(false);
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run tests/consultarNotasFiscais.test.ts`
Expected: FAIL — `r.filtro` undefined, `r.porProduto` undefined, e o teste de 120 falha porque só 80 detalhes são buscados.

- [ ] **Step 3: Implementar as mudanças**

Substituir o conteúdo de `src/tools/consultarNotasFiscais.ts` por:

```typescript
import type { BlingClient } from "../bling/blingClient";
import { listarNotasFiscais, obterNotaFiscal, listarNotasConsumidor, obterNotaConsumidor } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface NfDeps { client: BlingClient; }
export interface NfArgs { periodo: Periodo; dataInicial?: string; dataFinal?: string; tipo?: number; cfops?: string[]; }

export type CategoriaCfop = "venda" | "bonificacao" | "outra";

// Bonificação / brinde / amostra grátis.
const CFOP_BONIFICACAO = new Set(["5910", "6910", "5911", "6911"]);

// Teto de segurança contra runaway (não é o limite funcional de 80 anterior):
// buscamos o detalhe de TODAS as notas do período. As chamadas são serializadas/espacadas
// pelo BlingClient (~400ms), então não estoura rate limit — só demora em mês cheio.
const MAX_DETALHE = 2000;
const TOP_PRODUTOS = 50;

/**
 * Classifica um CFOP de SAÍDA em venda / bonificação / outra.
 * - Bonificação: 5910/6910/5911/6911.
 * - Venda (receita): famílias X.1xx (venda) e X.4xx (venda com ST), X ∈ {5,6,7}. Ex.: 5102, 6102, 6403.
 * - Outra: remessas (5915 conserto, 5901 industrialização…), transferências, devoluções, etc. — NÃO é venda.
 */
export function classificarCfop(cfop: string): CategoriaCfop {
  if (CFOP_BONIFICACAO.has(cfop)) return "bonificacao";
  if (/^[567][14]/.test(cfop)) return "venda";
  return "outra";
}

interface GrupoCfop { cfop: string; categoria: CategoriaCfop; valor: number; quantidade: number; itens: number; }
interface GrupoProduto { descricao: string; codigo?: string; valor: number; quantidade: number; itens: number; }
type Fonte = "nfe" | "nfce";

const arred = (n: number) => Math.round(n * 100) / 100;

export async function consultarNotasFiscais(deps: NfDeps, args: NfArgs, hoje: Date = new Date()) {
  const p = resolverPeriodo(args.periodo, hoje, args.dataInicial, args.dataFinal);
  const filtro = { dataInicial: p.dataInicial, dataFinal: p.dataFinal, tipo: args.tipo };

  // NF-e (modelo 55, B2B) + NFC-e (modelo 65, varejo) — endpoints separados na API v3.
  const [nfe, nfce] = await Promise.all([
    listarNotasFiscais(deps.client, filtro),
    listarNotasConsumidor(deps.client, filtro),
  ]);
  const todas: { nota: any; fonte: Fonte }[] = [
    ...nfe.itens.map((n: any) => ({ nota: n, fonte: "nfe" as const })),
    ...nfce.itens.map((n: any) => ({ nota: n, fonte: "nfce" as const })),
  ];
  let truncado = nfe.truncado || nfce.truncado;

  // A LISTA pode não trazer os itens (CFOP) por nota. Quando faltarem, busca o detalhe
  // no endpoint certo (/nfe/{id} ou /nfce/{id}). Buscamos TODAS (teto só de segurança).
  let detalhesBuscados = 0;
  const comItens: any[] = [];
  for (const { nota, fonte } of todas) {
    if ((nota.itens?.length ?? 0) > 0 || nota.id == null) {
      comItens.push(nota);
      continue;
    }
    if (detalhesBuscados >= MAX_DETALHE) { truncado = true; comItens.push(nota); continue; }
    detalhesBuscados++;
    try {
      const full: any = fonte === "nfce"
        ? await obterNotaConsumidor(deps.client, nota.id)
        : await obterNotaFiscal(deps.client, nota.id);
      const d = full?.data ?? full;
      comItens.push({ ...nota, itens: d?.itens ?? [] });
    } catch {
      comItens.push(nota);
    }
  }

  const setFiltro = args.cfops?.length ? new Set(args.cfops.map(String)) : null;
  const porCfopMap = new Map<string, GrupoCfop>();
  const porProdutoMap = new Map<string, GrupoProduto>();
  const filtroPorCfop = new Map<string, GrupoCfop>();
  for (const nota of comItens) {
    for (const it of (nota.itens ?? [])) {
      const cfop = String(it.cfop ?? "sem-cfop");
      const q = Number(it.quantidade) || 0;
      const v = Number(it.valor) || 0;
      const cur = porCfopMap.get(cfop) ?? { cfop, categoria: classificarCfop(cfop), valor: 0, quantidade: 0, itens: 0 };
      cur.valor += v; cur.quantidade += q; cur.itens += 1;
      porCfopMap.set(cfop, cur);

      const chaveP = String(it.descricao ?? it.codigo ?? "sem-descricao");
      const prod = porProdutoMap.get(chaveP) ?? { descricao: chaveP, codigo: it.codigo != null ? String(it.codigo) : undefined, valor: 0, quantidade: 0, itens: 0 };
      prod.valor += v; prod.quantidade += q; prod.itens += 1;
      porProdutoMap.set(chaveP, prod);

      if (setFiltro && setFiltro.has(cfop)) {
        const f = filtroPorCfop.get(cfop) ?? { cfop, categoria: classificarCfop(cfop), valor: 0, quantidade: 0, itens: 0 };
        f.valor += v; f.quantidade += q; f.itens += 1;
        filtroPorCfop.set(cfop, f);
      }
    }
  }
  const porCfop = [...porCfopMap.values()].map((c) => ({ ...c, valor: arred(c.valor) })).sort((a, b) => b.valor - a.valor);
  const porProduto = [...porProdutoMap.values()].map((p) => ({ ...p, valor: arred(p.valor) }))
    .sort((a, b) => b.quantidade - a.quantidade).slice(0, TOP_PRODUTOS);
  const somaCat = (cat: CategoriaCfop) =>
    arred(porCfop.filter((c) => c.categoria === cat).reduce((s, c) => s + c.valor, 0));

  const filtroBloco = setFiltro
    ? {
        cfops: args.cfops!,
        quantidade: arred([...filtroPorCfop.values()].reduce((s, c) => s + c.quantidade, 0)),
        valor: arred([...filtroPorCfop.values()].reduce((s, c) => s + c.valor, 0)),
        porCfop: [...filtroPorCfop.values()].map((c) => ({ ...c, valor: arred(c.valor) })).sort((a, b) => b.valor - a.valor),
      }
    : undefined;

  return {
    periodo: p,
    totalNotas: todas.length,
    totalNfe: nfe.itens.length,
    totalNfce: nfce.itens.length,
    porCfop,
    porProduto,
    filtro: filtroBloco,
    totalVenda: somaCat("venda"),
    totalBonificacao: somaCat("bonificacao"),
    totalOutras: somaCat("outra"),
    paginacao: { truncado },
    observacao:
      "Inclui NF-e (modelo 55) + NFC-e (varejo, modelo 65). CFOP por item: VENDA = 5.1/6.1/5.4/6.4; BONIFICAÇÃO = 5910/6910/5911/6911; OUTRAS (remessa/transferência/devolução) NÃO são venda. Busca o detalhe de TODAS as notas do período (pode demorar em mês cheio). Use 'cfops' para filtrar por CFOPs específicos.",
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run tests/consultarNotasFiscais.test.ts`
Expected: PASS (os 3 testes novos + os 4 antigos).

- [ ] **Step 5: Commit**

```bash
git add src/tools/consultarNotasFiscais.ts tests/consultarNotasFiscais.test.ts
git commit -m "feat(nf): remove teto de 80, filtro por CFOP e quebra por produto"
```

---

## Task 2: Nova tool `consultarCompras` (função pura + testes)

**Files:**
- Create: `src/tools/consultarCompras.ts`
- Test: `tests/consultarCompras.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/consultarCompras.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { consultarCompras } from "../src/tools/consultarCompras";

const REF = new Date("2026-07-08T12:00:00-03:00");

// Client mock: lista em /pedidos/compras; detalhe em /pedidos/compras/{id} via get.
function clienteCompras(pedidos: any[], detalhes: Record<string, any> = {}): any {
  return {
    getAllPages: async (path: string) =>
      path === "/pedidos/compras" ? { itens: pedidos, truncado: false } : { itens: [], truncado: false },
    get: async (path: string) => detalhes[path] ?? { data: {} },
  };
}

describe("consultarCompras", () => {
  it("agrega quantidade + valor por produto e separa producao x externo", async () => {
    const client = clienteCompras([
      { id: 1, numero: 10, contato: { id: 111, nome: "Fabrica" },
        itens: [{ descricao: "Café Torrado A", quantidade: 100, valor: 2000 }] },
      { id: 2, numero: 11, contato: { id: 999, nome: "Fornecedor Verde" },
        itens: [{ descricao: "Café Verde", quantidade: 300, valor: 9000 }] },
      { id: 3, numero: 12, contato: { id: 111, nome: "Fabrica" },
        itens: [{ descricao: "Café Torrado A", quantidade: 50, valor: 1000 }] },
    ]);
    const r: any = await consultarCompras({ client, hoje: REF, contatoId: "111" }, { periodo: "esta_semana" });

    expect(r.totalPedidos).toBe(3);
    expect(r.pedidosProducao).toBe(2);
    expect(r.pedidosExterno).toBe(1);
    expect(r.producao.quantidadeTotal).toBe(150); // 100 + 50
    expect(r.producao.valorTotal).toBe(3000);
    expect(r.producao.porProduto.find((p: any) => p.descricao === "Café Torrado A").quantidade).toBe(150);
    expect(r.externo.quantidadeTotal).toBe(300);
    expect(r.externo.porProduto[0].descricao).toBe("Café Verde");
  });

  it("busca o detalhe (GET /pedidos/compras/{id}) quando a lista não traz itens", async () => {
    const client = clienteCompras(
      [{ id: 7, numero: 7, contato: { id: 111, nome: "Fabrica" } }],
      { "/pedidos/compras/7": { data: { id: 7, itens: [{ descricao: "Café Torrado B", quantidade: 20, valor: 400 }] } } },
    );
    const r: any = await consultarCompras({ client, hoje: REF, contatoId: "111" }, { periodo: "esta_semana" });
    expect(r.producao.quantidadeTotal).toBe(20);
    expect(r.producao.porProduto[0].descricao).toBe("Café Torrado B");
  });

  it("sem contatoId, casa producao pelo nome 'fabrica'", async () => {
    const client = clienteCompras([
      { id: 1, numero: 1, contato: { id: 1, nome: "FÁBRICA Canastra" }, itens: [{ descricao: "X", quantidade: 5, valor: 100 }] },
      { id: 2, numero: 2, contato: { id: 2, nome: "Distribuidora" }, itens: [{ descricao: "Y", quantidade: 7, valor: 200 }] },
    ]);
    const r: any = await consultarCompras({ client, hoje: REF }, { periodo: "esta_semana" });
    expect(r.pedidosProducao).toBe(1);
    expect(r.pedidosExterno).toBe(1);
    expect(r.producao.quantidadeTotal).toBe(5);
    expect(r.externo.quantidadeTotal).toBe(7);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run tests/consultarCompras.test.ts`
Expected: FAIL — módulo `../src/tools/consultarCompras` não existe.

- [ ] **Step 3: Implementar `src/tools/consultarCompras.ts`**

```typescript
import type { BlingClient } from "../bling/blingClient";
import { listarPedidosCompra, obterPedidoCompra } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface ComprasDeps { client: BlingClient; hoje?: Date; contatoId?: string; }
export interface ComprasArgs { periodo: Periodo; dataInicial?: string; dataFinal?: string; }

// Mesma convenção do consultarProducao: produção = pedidos de compra do contato "Fabrica".
const CONTATO_PRODUCAO_NOME = "fabrica";
function normaliza(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
const arred = (n: number) => Math.round(n * 100) / 100;
const MAX_DETALHE = 2000;
const TOP_PRODUTOS = 50;

interface GrupoProduto { descricao: string; codigo?: string; quantidade: number; valor: number; itens: number; }

function agregaProdutos(pedidos: any[]) {
  const map = new Map<string, GrupoProduto>();
  let quantidadeTotal = 0, valorTotal = 0;
  for (const ped of pedidos) {
    for (const it of (ped.itens ?? [])) {
      const q = Number(it.quantidade) || 0;
      const v = Number(it.valor) || 0;
      quantidadeTotal += q; valorTotal += v;
      const chave = String(it.descricao ?? it.codigo ?? "sem-descricao");
      const cur = map.get(chave) ?? { descricao: chave, codigo: it.codigo != null ? String(it.codigo) : undefined, quantidade: 0, valor: 0, itens: 0 };
      cur.quantidade += q; cur.valor += v; cur.itens += 1;
      map.set(chave, cur);
    }
  }
  const porProduto = [...map.values()].map((p) => ({ ...p, valor: arred(p.valor) }))
    .sort((a, b) => b.quantidade - a.quantidade).slice(0, TOP_PRODUTOS);
  return { quantidadeTotal: arred(quantidadeTotal), valorTotal: arred(valorTotal), porProduto };
}

export async function consultarCompras(deps: ComprasDeps, args: ComprasArgs) {
  const periodo = resolverPeriodo(args.periodo, deps.hoje ?? new Date(), args.dataInicial, args.dataFinal);
  const { itens: pedidos, truncado: truncadoLista } = await listarPedidosCompra(deps.client, periodo);

  // Abre cada pedido para obter os itens quando a lista não os traz (teto só de segurança).
  let truncado = truncadoLista;
  let detalhes = 0;
  const comItens: any[] = [];
  for (const ped of pedidos) {
    if ((ped.itens?.length ?? 0) > 0 || ped.id == null) { comItens.push(ped); continue; }
    if (detalhes >= MAX_DETALHE) { truncado = true; comItens.push(ped); continue; }
    detalhes++;
    try {
      const full: any = await obterPedidoCompra(deps.client, ped.id);
      const d = full?.data ?? full;
      comItens.push({ ...ped, itens: d?.itens ?? [] });
    } catch {
      comItens.push(ped);
    }
  }

  const idAlvo = deps.contatoId ? String(deps.contatoId) : "";
  const ehProducao = (ped: any) => {
    const contato = ped.contato ?? ped.fornecedor ?? {};
    if (idAlvo && String(contato.id ?? "") === idAlvo) return true;
    return normaliza(contato.nome ?? "").includes(CONTATO_PRODUCAO_NOME);
  };
  const producaoPed = comItens.filter(ehProducao);
  const externoPed = comItens.filter((p) => !ehProducao(p));

  return {
    periodo,
    totalPedidos: comItens.length,
    pedidosProducao: producaoPed.length,
    pedidosExterno: externoPed.length,
    producao: agregaProdutos(producaoPed),
    externo: agregaProdutos(externoPed),
    paginacao: { truncado },
    observacao:
      "Compras = pedidos de compra do período, com quantidade por item. PRODUÇÃO = pedidos do contato 'Fabrica' (o Canastra registra ordem de produção assim). EXTERNO = demais fornecedores (matéria-prima: café verde/insumos). Busca o detalhe de TODOS os pedidos (pode demorar em mês cheio).",
  };
}
```

- [ ] **Step 4: Adicionar o endpoint `obterPedidoCompra` em `src/bling/endpoints.ts`**

Depois de `listarPedidosCompra` (linha ~16), adicionar:

```typescript
export async function obterPedidoCompra(c: BlingClient, id: number): Promise<any> {
  return c.get(`/pedidos/compras/${id}`);
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run tests/consultarCompras.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add src/tools/consultarCompras.ts src/bling/endpoints.ts tests/consultarCompras.test.ts
git commit -m "feat(compras): tool de compras por item (producao x externo)"
```

---

## Task 3: Registrar `consultar_compras` e atualizar schemas/descrições em `tools.ts`

**Files:**
- Modify: `src/agent/tools.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Atualizar o teste da lista de tools**

Em `tests/tools.test.ts`, no teste "expõe todas as tools típadas + a genérica", adicionar `"consultar_compras"` ao array esperado (mantendo ordem alfabética — entra logo após `"consultar_clientes"`):

```typescript
    expect(Object.keys(tools).sort()).toEqual([
      "bling_consultar_api",
      "consultar_catalogo",
      "consultar_clientes",
      "consultar_compras",
      "consultar_estoque",
      "consultar_faturamento",
      "consultar_financeiro",
      "consultar_notas_fiscais",
      "consultar_pedidos",
      "consultar_producao",
      "consultar_vendas",
      "contexto_cafe",
      "gerar_relatorio_diario",
    ]);
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/tools.test.ts`
Expected: FAIL — `consultar_compras` não está registrada.

- [ ] **Step 3: Implementar em `src/agent/tools.ts`**

Adicionar o import (junto aos outros imports de tools, após a linha do `consultarProducao`):

```typescript
import { consultarCompras } from "../tools/consultarCompras";
```

Atualizar o schema `cfops` e a descrição da tool `consultar_notas_fiscais` (substituir o bloco existente):

```typescript
    consultar_notas_fiscais: tool({
      description: "Notas fiscais (NF-e + NFC-e) do período: itens, CFOP por item, quantidade E valor por CFOP e por produto; separa venda de bonificação. Passe 'cfops' para filtrar CFOPs específicos (ex.: vendas = 5101,5102,6101,6102) e obter a quantidade+valor só desses. Busca TODAS as notas do período (pode demorar em mês cheio).",
      inputSchema: z.object({ ...periodoReq, tipo: z.number().optional().describe("0=entrada, 1=saída"), cfops: z.array(z.string()).optional().describe("Lista de CFOPs para filtrar, ex.: ['5101','5102','6101','6102']") }),
      execute: async (a) => consultarNotasFiscais({ client: deps.client }, a as any, hoje),
    }),
```

Adicionar a nova tool logo após `consultar_producao`:

```typescript
    consultar_compras: tool({
      description: "Compras do período (pedidos de compra) com QUANTIDADE por item. Separa PRODUÇÃO (pedidos do contato 'Fabrica' = produtos torrados/produzidos) de EXTERNO (fornecedores: matéria-prima, café verde/insumos). Use para 'quanto comprei/produzi em quantidade'. Busca TODOS os pedidos (pode demorar em mês cheio).",
      inputSchema: z.object({ ...periodoReq }),
      execute: async (a) => consultarCompras({ ...base, contatoId: deps.producaoContatoId }, a as any),
    }),
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools.ts tests/tools.test.ts
git commit -m "feat(tools): registra consultar_compras e filtro cfops em consultar_notas_fiscais"
```

---

## Task 4: Permitir `/nfce` no read-only guard

**Files:**
- Modify: `src/bling/readOnlyGuard.ts`
- Test: `tests/readOnlyGuard.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/readOnlyGuard.test.ts`, no teste "aceita paths de leitura conhecidos", adicionar:

```typescript
    expect(validarPathLeitura("/nfce")).toBe(true);
    expect(validarPathLeitura("/nfce/123")).toBe(true);
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/readOnlyGuard.test.ts`
Expected: FAIL — `/nfce` retorna false.

- [ ] **Step 3: Implementar**

Em `src/bling/readOnlyGuard.ts`, adicionar `"/nfce",` na lista `PREFIXOS_LEITURA` (logo após `"/nfe",`):

```typescript
  "/nfe",
  "/nfce",
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/readOnlyGuard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bling/readOnlyGuard.ts tests/readOnlyGuard.test.ts
git commit -m "fix(guard): permite /nfce (varejo) no escape hatch read-only"
```

---

## Task 5: Orientar o modelo no system prompt

**Files:**
- Modify: `src/agent/systemPrompt.ts`

- [ ] **Step 1: Editar o system prompt**

Em `src/agent/systemPrompt.ts`, na lista "O QUE VOCÊ CONSEGUE CONSULTAR", substituir a linha de PRODUÇÃO por estas duas:

```typescript
    "- PRODUÇÃO / COMPRAS: o Canastra registra cada ordem de produção como um PEDIDO DE COMPRA do contato 'Fabrica'. Para VALOR/nº de ordens de produção use consultar_producao. Para QUANTIDADE por item (produzida ou comprada), use consultar_compras — ela separa PRODUÇÃO (Fabrica) de EXTERNO (matéria-prima).",
```

E na seção "COMO TRABALHAR", substituir a linha "Para CFOP / venda vs bonificação..." por:

```typescript
    "- Para CFOP / quantidade vendida, use consultar_notas_fiscais; quando o gestor listar CFOPs (ex.: vendas = 5101,5102,6101,6102), passe-os em 'cfops' para obter quantidade+valor só desses. Para quantidade comprada/produzida por item, use consultar_compras. Essas consultas de mês inteiro são COMPLETAS mas podem demorar — NÃO desista nem diga que a API não expõe o dado; deixe a ferramenta terminar.",
```

- [ ] **Step 2: Rodar a suíte de systemPrompt (se houver) e o build de tipos**

Run: `npx vitest run tests/systemPrompt.test.ts`
Expected: PASS (o teste não fixa o texto exato dessas linhas; se fixar, ajustar a asserção).

- [ ] **Step 3: Commit**

```bash
git add src/agent/systemPrompt.ts tests/systemPrompt.test.ts
git commit -m "docs(prompt): orienta uso de cfops e consultar_compras; não desistir cedo"
```

---

## Task 6: Verificação final

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — todos os testes (novos e antigos) verdes.

- [ ] **Step 2: Type-check / build**

Run: `npx tsc --noEmit`
Expected: sem erros de tipo.

- [ ] **Step 3: Atualizar o README (seção "O que dá para perguntar")**

Em `README.md`, na seção "O que dá para perguntar", adicionar sob NF-e/fiscal e uma linha de compras:

```markdown
- **NF-e/fiscal:** "Quantas unidades vendi em julho nos CFOP 5101/5102/6101/6102?" · "Quanto foi bonificação?" · "Vendas por produto no mês?"
- **Compras/produção:** "Quantos produtos comprei/produzi em julho?" (separa Fabrica de fornecedores externos, com quantidade por item)
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): perguntas de quantidade por CFOP e compras por item"
```

---

## Self-Review (feito pelo autor do plano)

- **Cobertura do spec:** teto de 80 removido (T1) · filtro cfops + quantidade/valor (T1) · porProduto (T1) · consultar_compras producao x externo com quantidade por item (T2/T3) · /nfce no guard (T4) · orientação do modelo (T5) · docs (T6). ✔
- **Sem placeholders:** todos os steps trazem código/comandos reais. ✔
- **Consistência de tipos:** `cfops?: string[]` em `NfArgs` e no schema zod; `obterPedidoCompra` criado em T2 e usado em `consultarCompras`; `producaoContatoId` já existe em `ToolDeps`; nomes de campos (`producao.quantidadeTotal`, `porProduto`, `filtro.quantidade`) batem entre testes e implementação. ✔
- **Regex normaliza:** em `consultarCompras.ts` usei `/[̀-ͯ]/g` (escapes unicode) — equivale ao range de diacríticos usado em `consultarProducao.ts`. ✔
