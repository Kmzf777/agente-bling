import { describe, it, expect } from "vitest";
import { toolDefinitions, executarTool, construirTools } from "../src/agent/tools";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = { getAllPages: async () => ({ itens: [{ total: 10 }], truncado: false }) } as any;

describe("registro de ferramentas", () => {
  it("expõe as 9 ferramentas no formato OpenAI", () => {
    const nomes = toolDefinitions.map((t) => t.function.name).sort();
    expect(nomes).toEqual([
      "consultar_catalogo",
      "consultar_clientes",
      "consultar_estoque",
      "consultar_faturamento",
      "consultar_financeiro",
      "consultar_pedidos",
      "consultar_producao",
      "consultar_vendas",
      "gerar_relatorio_diario",
    ]);
    for (const t of toolDefinitions) {
      expect(t.type).toBe("function");
      expect(t.function.parameters.type).toBe("object");
    }
  });
  it("dispatcher executa a ferramenta pelo nome", async () => {
    const r = await executarTool("consultar_vendas", { periodo: "hoje" }, { client, situacoesFaturado: [9], hoje: REF });
    expect((r as any).numeroPedidos).toBe(1);
  });
  it("erro em ferramenta desconhecida", async () => {
    await expect(executarTool("nao_existe", {}, { client, situacoesFaturado: [], hoje: REF }))
      .rejects.toThrow(/desconhecida/);
  });
});

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
});
