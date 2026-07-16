function fmtBRL(v: unknown): string {
  const n = Math.round(Number(v) || 0);
  const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${n < 0 ? "-" : ""}${s}`;
}

/** Resumo de 1 linha do resultado de uma tool, para o card de atividade do agente. */
export function resumirResultado(nome: string, output: any): string {
  const o = output ?? {};
  switch (nome) {
    case "consultar_vendas":
      return `${o.numeroPedidos ?? 0} pedidos · ${fmtBRL(o.valorTotal)}`;
    case "consultar_faturamento":
      return `${fmtBRL(o.faturamento)}${o.variacaoPercentual != null ? ` (${o.variacaoPercentual}% vs anterior)` : ""}`;
    case "consultar_notas_fiscais":
      return `${o.totalNotas ?? 0} NF-e · venda ${fmtBRL(o.totalVenda)}${Number(o.totalBonificacao) > 0 ? ` · bonif. ${fmtBRL(o.totalBonificacao)}` : ""}${Number(o.totalOutras) > 0 ? ` · outras ${fmtBRL(o.totalOutras)}` : ""}`;
    case "consultar_financeiro":
      return `pago ${fmtBRL(o.totalPago)} · aberto ${fmtBRL(o.totalEmAberto)}`;
    case "consultar_estoque":
      return `${o.total ?? o.itens?.length ?? 0} itens${o.filtro === "abaixo_minimo" ? " abaixo do mínimo" : ""}`;
    case "consultar_producao":
      return `${o.numeroOrdens ?? 0} ordens · ${o.quantidadeTotal ?? 0} un`;
    case "consultar_catalogo":
      return `${o.total ?? o.produtos?.length ?? 0} produtos`;
    case "consultar_clientes":
      return `${o.total ?? o.clientes?.length ?? 0} clientes`;
    case "consultar_pedidos":
      return `${o.pedidos?.length ?? o.total ?? 0} pedidos`;
    case "gerar_relatorio_diario":
      return "relatório do dia";
    case "bling_consultar_api":
      return `${Array.isArray(o.dados) ? o.dados.length : 1} registros`;
    default:
      return "concluído";
  }
}
