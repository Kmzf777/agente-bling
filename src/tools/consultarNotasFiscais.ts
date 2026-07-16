import type { BlingClient } from "../bling/blingClient";
import { listarNotasFiscais, obterNotaFiscal } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface NfDeps { client: BlingClient; }
export interface NfArgs { periodo: Periodo; dataInicial?: string; dataFinal?: string; tipo?: number; }

export type CategoriaCfop = "venda" | "bonificacao" | "outra";

// Bonificação / brinde / amostra grátis.
const CFOP_BONIFICACAO = new Set(["5910", "6910", "5911", "6911"]);

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

export async function consultarNotasFiscais(deps: NfDeps, args: NfArgs, hoje: Date = new Date()) {
  const p = resolverPeriodo(args.periodo, hoje, args.dataInicial, args.dataFinal);
  const { itens: notas, truncado } = await listarNotasFiscais(deps.client, {
    dataInicial: p.dataInicial,
    dataFinal: p.dataFinal,
    tipo: args.tipo,
  });

  // O endpoint de LISTA de NF-e pode não trazer os itens (CFOP) por nota. Quando faltarem,
  // buscamos o detalhe (GET /nfe/{id}), com um teto para respeitar o rate limit do Bling.
  const MAX_DETALHE = 80;
  let detalhesBuscados = 0;
  const comItens: any[] = [];
  for (const nota of notas) {
    if ((nota.itens?.length ?? 0) > 0 || nota.id == null || detalhesBuscados >= MAX_DETALHE) {
      comItens.push(nota);
      continue;
    }
    detalhesBuscados++;
    try {
      const full: any = await obterNotaFiscal(deps.client, nota.id);
      const d = full?.data ?? full;
      comItens.push({ ...nota, itens: d?.itens ?? [] });
    } catch {
      comItens.push(nota);
    }
  }

  const agrupado = new Map<string, GrupoCfop>();
  for (const nota of comItens) {
    for (const it of (nota.itens ?? [])) {
      const cfop = String(it.cfop ?? "sem-cfop");
      const cur = agrupado.get(cfop) ?? { cfop, categoria: classificarCfop(cfop), valor: 0, quantidade: 0, itens: 0 };
      cur.valor += Number(it.valor) || 0;
      cur.quantidade += Number(it.quantidade) || 0;
      cur.itens += 1;
      agrupado.set(cfop, cur);
    }
  }
  const porCfop = [...agrupado.values()].sort((a, b) => b.valor - a.valor);
  const somaCat = (cat: CategoriaCfop) =>
    Math.round(porCfop.filter((c) => c.categoria === cat).reduce((s, c) => s + c.valor, 0) * 100) / 100;

  return {
    periodo: p,
    totalNotas: notas.length,
    porCfop,
    totalVenda: somaCat("venda"),
    totalBonificacao: somaCat("bonificacao"),
    totalOutras: somaCat("outra"),
    paginacao: { truncado },
    observacao:
      "CFOP por item da NF-e. VENDA = famílias 5.1/6.1/5.4/6.4 (inclui venda com ST). BONIFICAÇÃO = 5910/6910/5911/6911. OUTRAS (remessa/transferência/devolução, ex.: 5915) NÃO são venda.",
  };
}
