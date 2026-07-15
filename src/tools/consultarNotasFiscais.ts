import type { BlingClient } from "../bling/blingClient";
import { listarNotasFiscais, obterNotaFiscal } from "../bling/endpoints";
import { resolverPeriodo, type Periodo } from "../util/periodo";

export interface NfDeps { client: BlingClient; }
export interface NfArgs { periodo: Periodo; dataInicial?: string; dataFinal?: string; tipo?: number; }

// CFOPs de bonificação/brinde/amostra mais comuns (saída). Referência geral — ajuste conforme a operação.
const CFOP_BONIFICACAO = new Set(["5910", "6910", "5911", "6911"]);

interface GrupoCfop { cfop: string; bonificacao: boolean; valor: number; quantidade: number; itens: number; }

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
      const cur = agrupado.get(cfop) ?? { cfop, bonificacao: CFOP_BONIFICACAO.has(cfop), valor: 0, quantidade: 0, itens: 0 };
      cur.valor += Number(it.valor) || 0;
      cur.quantidade += Number(it.quantidade) || 0;
      cur.itens += 1;
      agrupado.set(cfop, cur);
    }
  }
  const porCfop = [...agrupado.values()].sort((a, b) => b.valor - a.valor);

  return {
    periodo: p,
    totalNotas: notas.length,
    porCfop,
    totalVenda: Math.round(porCfop.filter((c) => !c.bonificacao).reduce((s, c) => s + c.valor, 0) * 100) / 100,
    totalBonificacao: Math.round(porCfop.filter((c) => c.bonificacao).reduce((s, c) => s + c.valor, 0) * 100) / 100,
    paginacao: { truncado },
    observacao: "CFOP por item da NF-e; bonificação identificada por CFOP (5910/6910/5911/6911).",
  };
}
