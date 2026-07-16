import { describe, it, expect } from "vitest";
import { consultarNotasFiscais } from "../src/tools/consultarNotasFiscais";

const nf = (itens: any[]) => ({ id: 1, numero: "1", tipo: 1, dataEmissao: "2026-06-10", naturezaOperacao: "Venda", itens });

describe("consultarNotasFiscais", () => {
  it("agrupa itens por CFOP e separa venda de bonificação", async () => {
    const client: any = {
      getAllPages: async () => ({
        itens: [
          nf([{ descricao: "Café A", cfop: "5102", valor: 100, quantidade: 2 }]),
          nf([{ descricao: "Café A", cfop: "5102", valor: 50, quantidade: 1 }]),
          nf([{ descricao: "Brinde", cfop: "5910", valor: 30, quantidade: 1 }]),
        ],
        truncado: false,
      }),
    };
    const r: any = await consultarNotasFiscais({ client }, { periodo: "mes_passado" }, new Date("2026-07-15"));

    expect(r.totalNotas).toBe(3);
    const cfops = r.porCfop.map((c: any) => c.cfop);
    expect(cfops).toContain("5102");
    expect(cfops).toContain("5910");

    const venda = r.porCfop.find((c: any) => c.cfop === "5102");
    expect(venda.categoria).toBe("venda");
    expect(venda.valor).toBe(150); // 100 + 50 agregados

    const bonif = r.porCfop.find((c: any) => c.cfop === "5910");
    expect(bonif.categoria).toBe("bonificacao");

    expect(r.totalVenda).toBe(150);
    expect(r.totalBonificacao).toBe(30);
  });

  it("NÃO conta remessa (CFOP 5915) como venda — vai para 'outras'", async () => {
    const client: any = {
      getAllPages: async () => ({
        itens: [
          nf([{ descricao: "Café vendido", cfop: "5102", valor: 200, quantidade: 5 }]),
          nf([{ descricao: "Remessa p/ conserto", cfop: "5915", valor: 40000, quantidade: 100 }]),
          nf([{ descricao: "Brinde", cfop: "5910", valor: 30, quantidade: 1 }]),
          nf([{ descricao: "Venda ST", cfop: "6403", valor: 100, quantidade: 1 }]),
        ],
        truncado: false,
      }),
    };
    const r: any = await consultarNotasFiscais({ client }, { periodo: "mes_passado" }, new Date("2026-07-15"));

    expect(r.porCfop.find((c: any) => c.cfop === "5915").categoria).toBe("outra");
    expect(r.porCfop.find((c: any) => c.cfop === "6403").categoria).toBe("venda"); // 6.4xx = venda com ST
    // "Vendas mesmo" = 5102 + 6403 = 300 (NÃO inclui a remessa de 40k).
    expect(r.totalVenda).toBe(300);
    expect(r.totalBonificacao).toBe(30);
    expect(r.totalOutras).toBe(40000);
  });

  it("busca o detalhe da NF (GET /nfe/{id}) quando a lista não traz itens", async () => {
    const client: any = {
      getAllPages: async () => ({ itens: [{ id: 7, numero: "7", dataEmissao: "2026-06-10" }], truncado: false }),
      get: async (path: string) => {
        expect(path).toBe("/nfe/7");
        return { data: { id: 7, itens: [{ cfop: "5102", valor: 80, quantidade: 1 }] } };
      },
    };
    const r: any = await consultarNotasFiscais({ client }, { periodo: "mes_passado" }, new Date("2026-07-15"));
    expect(r.totalNotas).toBe(1);
    expect(r.porCfop.find((c: any) => c.cfop === "5102")?.valor).toBe(80);
    expect(r.totalVenda).toBe(80);
  });
});
