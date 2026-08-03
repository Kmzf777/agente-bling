import { describe, it, expect } from "vitest";
import { consultarNotasFiscais } from "../src/tools/consultarNotasFiscais";

const nf = (itens: any[]) => ({ id: 1, numero: "1", tipo: 1, dataEmissao: "2026-06-10", naturezaOperacao: "Venda", itens });

// Cliente mock que responde por endpoint (/nfe, /nfce), vazio no resto.
function clienteNotas(porPath: Record<string, any[]>, get?: any): any {
  return {
    getAllPages: async (path: string) => ({ itens: porPath[path] ?? [], truncado: false }),
    get,
  };
}

describe("consultarNotasFiscais", () => {
  it("agrupa itens por CFOP e separa venda de bonificação", async () => {
    const client = clienteNotas({
      "/nfe": [
        nf([{ descricao: "Café A", cfop: "5102", valor: 100, quantidade: 2 }]),
        nf([{ descricao: "Café A", cfop: "5102", valor: 50, quantidade: 1 }]),
        nf([{ descricao: "Brinde", cfop: "5910", valor: 30, quantidade: 1 }]),
      ],
    });
    const r: any = await consultarNotasFiscais({ client }, { periodo: "mes_passado" }, new Date("2026-07-15"));

    expect(r.totalNotas).toBe(3);
    const venda = r.porCfop.find((c: any) => c.cfop === "5102");
    expect(venda.categoria).toBe("venda");
    expect(venda.valor).toBe(150); // 100 + 50 agregados
    const bonif = r.porCfop.find((c: any) => c.cfop === "5910");
    expect(bonif.categoria).toBe("bonificacao");
    expect(r.totalVenda).toBe(150);
    expect(r.totalBonificacao).toBe(30);
  });

  it("NÃO conta remessa (CFOP 5915) como venda — vai para 'outras'", async () => {
    const client = clienteNotas({
      "/nfe": [
        nf([{ descricao: "Café vendido", cfop: "5102", valor: 200, quantidade: 5 }]),
        nf([{ descricao: "Remessa p/ conserto", cfop: "5915", valor: 40000, quantidade: 100 }]),
        nf([{ descricao: "Brinde", cfop: "5910", valor: 30, quantidade: 1 }]),
        nf([{ descricao: "Venda ST", cfop: "6403", valor: 100, quantidade: 1 }]),
      ],
    });
    const r: any = await consultarNotasFiscais({ client }, { periodo: "mes_passado" }, new Date("2026-07-15"));

    expect(r.porCfop.find((c: any) => c.cfop === "5915").categoria).toBe("outra");
    expect(r.porCfop.find((c: any) => c.cfop === "6403").categoria).toBe("venda"); // 6.4xx = venda com ST
    expect(r.totalVenda).toBe(300); // 5102 + 6403 (NÃO inclui a remessa de 40k)
    expect(r.totalBonificacao).toBe(30);
    expect(r.totalOutras).toBe(40000);
  });

  it("combina NF-e + NFC-e (varejo) nas vendas", async () => {
    const client = clienteNotas({
      "/nfe": [nf([{ cfop: "6102", valor: 1000, quantidade: 1 }])],
      "/nfce": [nf([{ cfop: "5102", valor: 4000, quantidade: 50 }])],
    });
    const r: any = await consultarNotasFiscais({ client }, { periodo: "mes_passado" }, new Date("2026-07-15"));

    expect(r.totalNotas).toBe(2); // 1 NF-e + 1 NFC-e
    expect(r.totalNfe).toBe(1);
    expect(r.totalNfce).toBe(1);
    expect(r.totalVenda).toBe(5000); // 1000 (NF-e) + 4000 (NFC-e varejo)
  });

  it("busca o detalhe (GET /nfe/{id} ou /nfce/{id}) quando a lista não traz itens", async () => {
    const client = clienteNotas(
      { "/nfe": [{ id: 7, numero: "7", dataEmissao: "2026-06-10" }] },
      async (path: string) => {
        expect(path).toBe("/nfe/7");
        return { data: { id: 7, itens: [{ cfop: "5102", valor: 80, quantidade: 1 }] } };
      },
    );
    const r: any = await consultarNotasFiscais({ client }, { periodo: "mes_passado" }, new Date("2026-07-15"));
    expect(r.totalNotas).toBe(1);
    expect(r.porCfop.find((c: any) => c.cfop === "5102")?.valor).toBe(80);
    expect(r.totalVenda).toBe(80);
  });

  it("filtra por lista de CFOPs (quantidade + valor) e ignora o resto", async () => {
    const client = clienteNotas({
      "/nfe": [
        nf([{ descricao: "Café A", codigo: "A", cfop: "5101", valor: 100, quantidade: 10 }]),
        nf([{ descricao: "Café B", codigo: "B", cfop: "6102", valor: 200, quantidade: 5 }]),
        nf([{ descricao: "Remessa", cfop: "5915", valor: 999, quantidade: 100 }]),
        nf([{ descricao: "Brinde", cfop: "5910", valor: 30, quantidade: 3 }]),
      ],
    });
    const r: any = await consultarNotasFiscais(
      { client },
      { periodo: "mes_passado", cfops: ["5101", "5102", "6101", "6102"] },
      new Date("2026-07-15"),
    );
    expect(r.filtro.cfops).toEqual(["5101", "5102", "6101", "6102"]);
    expect(r.filtro.quantidade).toBe(15); // 10 (5101) + 5 (6102)
    expect(r.filtro.valor).toBe(300); // 100 + 200 (NÃO inclui remessa nem brinde)
    expect(r.filtro.porCfop.find((c: any) => c.cfop === "5101").quantidade).toBe(10);
  });

  it("quebra por produto (quantidade + valor agregados por descrição)", async () => {
    const client = clienteNotas({
      "/nfe": [
        nf([{ descricao: "Café A", cfop: "5102", valor: 100, quantidade: 2 }]),
        nf([{ descricao: "Café A", cfop: "5102", valor: 50, quantidade: 1 }]),
        nf([{ descricao: "Café B", cfop: "5102", valor: 40, quantidade: 4 }]),
      ],
    });
    const r: any = await consultarNotasFiscais({ client }, { periodo: "mes_passado" }, new Date("2026-07-15"));
    const cafeA = r.porProduto.find((p: any) => p.descricao === "Café A");
    expect(cafeA.quantidade).toBe(3); // 2 + 1
    expect(cafeA.valor).toBe(150);
    expect(r.porProduto[0].descricao).toBe("Café A"); // ordenado por quantidade desc
  });

  it("busca o detalhe de MAIS de 80 notas (sem teto de 80)", async () => {
    const notas = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, numero: String(i + 1), dataEmissao: "2026-06-10" }));
    let detalhes = 0;
    const client = clienteNotas(
      { "/nfe": notas },
      async (path: string) => {
        detalhes++;
        return { data: { id: 1, itens: [{ descricao: "Café A", cfop: "5102", valor: 10, quantidade: 1 }] } };
      },
    );
    const r: any = await consultarNotasFiscais({ client }, { periodo: "mes_passado" }, new Date("2026-07-15"));
    expect(detalhes).toBe(120); // todas as 120 tiveram o detalhe buscado, não só 80
    expect(r.totalVenda).toBe(1200); // 120 * 10
    expect(r.paginacao.truncado).toBe(false);
  });
});
