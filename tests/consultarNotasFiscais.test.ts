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
    expect(venda.bonificacao).toBe(false);
    expect(venda.valor).toBe(150); // 100 + 50 agregados

    const bonif = r.porCfop.find((c: any) => c.cfop === "5910");
    expect(bonif.bonificacao).toBe(true);

    expect(r.totalVenda).toBe(150);
    expect(r.totalBonificacao).toBe(30);
  });
});
