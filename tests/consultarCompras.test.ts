import { describe, it, expect } from "vitest";
import { consultarCompras } from "../src/tools/consultarCompras";

const REF = new Date("2026-07-08T12:00:00-03:00");

// Client mock: lista em /pedidos/compras; detalhe em /pedidos/compras/{id} via get.
function clienteCompras(pedidos: any[], detalhes: Record<string, any> = {}): any {
  return {
    getAllPages: async (path: string) =>
      path === "/pedidos/compras" ? { itens: pedidos, truncado: false } : { itens: [], truncado: false },
    get: async (path: string) => detalhes[path] ?? { data: {} },
  };
}

describe("consultarCompras", () => {
  it("agrega quantidade + valor por produto e separa producao x externo", async () => {
    const client = clienteCompras([
      { id: 1, numero: 10, contato: { id: 111, nome: "Fabrica" },
        itens: [{ descricao: "Café Torrado A", quantidade: 100, valor: 2000 }] },
      { id: 2, numero: 11, contato: { id: 999, nome: "Fornecedor Verde" },
        itens: [{ descricao: "Café Verde", quantidade: 300, valor: 9000 }] },
      { id: 3, numero: 12, contato: { id: 111, nome: "Fabrica" },
        itens: [{ descricao: "Café Torrado A", quantidade: 50, valor: 1000 }] },
    ]);
    const r: any = await consultarCompras({ client, hoje: REF, contatoId: "111" }, { periodo: "esta_semana" });

    expect(r.totalPedidos).toBe(3);
    expect(r.pedidosProducao).toBe(2);
    expect(r.pedidosExterno).toBe(1);
    expect(r.producao.quantidadeTotal).toBe(150); // 100 + 50
    expect(r.producao.valorTotal).toBe(3000);
    expect(r.producao.porProduto.find((p: any) => p.descricao === "Café Torrado A").quantidade).toBe(150);
    expect(r.externo.quantidadeTotal).toBe(300);
    expect(r.externo.porProduto[0].descricao).toBe("Café Verde");
  });

  it("busca o detalhe (GET /pedidos/compras/{id}) quando a lista não traz itens", async () => {
    const client = clienteCompras(
      [{ id: 7, numero: 7, contato: { id: 111, nome: "Fabrica" } }],
      { "/pedidos/compras/7": { data: { id: 7, itens: [{ descricao: "Café Torrado B", quantidade: 20, valor: 400 }] } } },
    );
    const r: any = await consultarCompras({ client, hoje: REF, contatoId: "111" }, { periodo: "esta_semana" });
    expect(r.producao.quantidadeTotal).toBe(20);
    expect(r.producao.porProduto[0].descricao).toBe("Café Torrado B");
  });

  it("sem contatoId, casa producao pelo nome 'fabrica'", async () => {
    const client = clienteCompras([
      { id: 1, numero: 1, contato: { id: 1, nome: "FÁBRICA Canastra" }, itens: [{ descricao: "X", quantidade: 5, valor: 100 }] },
      { id: 2, numero: 2, contato: { id: 2, nome: "Distribuidora" }, itens: [{ descricao: "Y", quantidade: 7, valor: 200 }] },
    ]);
    const r: any = await consultarCompras({ client, hoje: REF }, { periodo: "esta_semana" });
    expect(r.pedidosProducao).toBe(1);
    expect(r.pedidosExterno).toBe(1);
    expect(r.producao.quantidadeTotal).toBe(5);
    expect(r.externo.quantidadeTotal).toBe(7);
  });
});
