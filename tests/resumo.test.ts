import { describe, it, expect } from "vitest";
import { resumirResultado } from "../src/agent/resumo";

describe("resumirResultado", () => {
  it("vendas", () =>
    expect(resumirResultado("consultar_vendas", { numeroPedidos: 2, valorTotal: 150 })).toBe("2 pedidos · R$ 150"));
  it("faturamento com variação", () =>
    expect(resumirResultado("consultar_faturamento", { faturamento: 45000, variacaoPercentual: 12 })).toBe("R$ 45.000 (12% vs anterior)"));
  it("notas fiscais com bonificação", () =>
    expect(resumirResultado("consultar_notas_fiscais", { totalNotas: 3, totalVenda: 45000, totalBonificacao: 30 }))
      .toBe("3 NF-e · venda R$ 45.000 · bonif. R$ 30"));
  it("financeiro pago/aberto", () =>
    expect(resumirResultado("consultar_financeiro", { totalPago: 100, totalEmAberto: 75 })).toBe("pago R$ 100 · aberto R$ 75"));
  it("estoque abaixo do mínimo", () =>
    expect(resumirResultado("consultar_estoque", { total: 4, filtro: "abaixo_minimo" })).toBe("4 itens abaixo do mínimo"));
  it("api genérica conta registros", () =>
    expect(resumirResultado("bling_consultar_api", { dados: [1, 2, 3] })).toBe("3 registros"));
  it("fallback desconhecido", () => expect(resumirResultado("qualquer_coisa", {})).toBe("concluído"));
});
