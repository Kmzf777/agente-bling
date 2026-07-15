import { describe, it, expect } from "vitest";
import { construirTools } from "../src/agent/tools";

const REF = new Date("2026-07-08T12:00:00-03:00");

describe("construirTools (AI SDK)", () => {
  it("expõe todas as tools típadas + a genérica", () => {
    const tools = construirTools({ client: {} as any, situacoesFaturado: [], hoje: REF });
    expect(Object.keys(tools).sort()).toEqual([
      "bling_consultar_api",
      "consultar_catalogo",
      "consultar_clientes",
      "consultar_estoque",
      "consultar_faturamento",
      "consultar_financeiro",
      "consultar_notas_fiscais",
      "consultar_pedidos",
      "consultar_producao",
      "consultar_vendas",
      "gerar_relatorio_diario",
    ]);
    for (const t of Object.values(tools) as any[]) {
      expect(typeof t.description).toBe("string");
      expect(typeof t.execute).toBe("function");
    }
  });

  it("a tool consultar_vendas executa e agrega pelo client mockado", async () => {
    const client: any = { getAllPages: async () => ({ itens: [{ total: 100 }, { total: 50 }], truncado: false }) };
    const tools: any = construirTools({ client, situacoesFaturado: [9], hoje: REF });
    const r = await tools.consultar_vendas.execute({ periodo: "hoje" });
    expect(r.numeroPedidos).toBe(2);
    expect(r.valorTotal).toBe(150);
  });

  it("a tool consultar_notas_fiscais agrega por CFOP e separa bonificação", async () => {
    const client: any = { getAllPages: async () => ({ itens: [
      { itens: [{ cfop: "5102", valor: 100, quantidade: 1 }] },
      { itens: [{ cfop: "5910", valor: 20, quantidade: 1 }] },
    ], truncado: false }) };
    const tools: any = construirTools({ client, situacoesFaturado: [], hoje: REF });
    const r = await tools.consultar_notas_fiscais.execute({ periodo: "mes_passado" });
    expect(r.totalVenda).toBe(100);
    expect(r.totalBonificacao).toBe(20);
  });
});
