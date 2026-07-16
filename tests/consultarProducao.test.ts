import { describe, it, expect } from "vitest";
import { consultarProducao } from "../src/tools/consultarProducao";

const REF = new Date("2026-07-08T12:00:00-03:00");

describe("consultarProducao (pedidos de compra da Fabrica)", () => {
  it("conta só os pedidos de compra do contato Fabrica e soma o valor", async () => {
    const client: any = {
      getAllPages: async (path: string) =>
        path === "/pedidos/compras"
          ? {
              itens: [
                { numero: 10, data: "2026-07-06", total: 1000, contato: { nome: "Fabrica" } },
                { numero: 11, data: "2026-07-07", total: 500, contato: { nome: "Fornecedor X" } },
                { numero: 12, data: "2026-07-08", total: 300, contato: { nome: "FÁBRICA Canastra" } },
              ],
              truncado: false,
            }
          : { itens: [], truncado: false },
    };
    const r = await consultarProducao({ client, hoje: REF }, { periodo: "esta_semana" });
    expect(r.numeroOrdens).toBe(2); // Fabrica (10) e FÁBRICA Canastra (12); Fornecedor X fica de fora
    expect(r.valorTotal).toBe(1300);
    expect(r.ordens.map((o: any) => o.numero)).toEqual([10, 12]);
  });
});
