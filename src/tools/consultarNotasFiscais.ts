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
    .sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor).slice(0, TOP_PRODUTOS);
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
