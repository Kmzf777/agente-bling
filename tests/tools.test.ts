import { describe, it, expect } from "vitest";
import { toolDefinitions, executarTool } from "../src/agent/tools";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = { getAllPages: async () => [{ total: 10 }] } as any;

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
