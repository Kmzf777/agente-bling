import { describe, it, expect } from "vitest";
import { consultarProducao } from "../src/tools/consultarProducao";

const REF = new Date("2026-07-08T12:00:00-03:00");

function clienteCompras(itens: any[]): any {
  return {
    getAllPages: async (path: string) => (path === "/pedidos/compras" ? { itens, truncado: false } : { itens: [], truncado: false }),
  };
}

describe("consultarProducao (pedidos de compra da Fabrica)", () => {
  it("filtra pelo ID do contato (robusto), com fallback por nome", async () => {
    const client = clienteCompras([
      { numero: 10, data: "2026-07-06", total: 1000, contato: { id: 11424392310, nome: "Qualquer Nome" } }, // casa por ID
      { numero: 11, data: "2026-07-07", total: 500, contato: { id: 999, nome: "Outro Fornecedor" } }, // fora
      { numero: 12, data: "2026-07-08", total: 300, contato: { id: 555, nome: "FÁBRICA Canastra" } }, // casa por nome
    ]);
    const r = await consultarProducao({ client, hoje: REF, contatoId: "11424392310" }, { periodo: "esta_semana" });
    expect(r.numeroOrdens).toBe(2); // 10 (ID) + 12 (nome)
    expect(r.valorTotal).toBe(1300);
    expect(r.ordens.map((o: any) => o.numero)).toEqual([10, 12]);
  });

  it("sem contatoId, cai no fallback por nome 'fabrica'", async () => {
    const client = clienteCompras([
      { numero: 20, total: 700, contato: { id: 1, nome: "Fabrica" } },
      { numero: 21, total: 200, contato: { id: 2, nome: "Distribuidora" } },
    ]);
    const r = await consultarProducao({ client, hoje: REF }, { periodo: "esta_semana" });
    expect(r.numeroOrdens).toBe(1);
    expect(r.valorTotal).toBe(700);
  });
});
