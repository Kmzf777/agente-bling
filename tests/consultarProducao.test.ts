import { describe, it, expect } from "vitest";
import { consultarProducao } from "../src/tools/consultarProducao";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = { getAllPages: async () => ({ itens: [
  { id: 1, quantidade: 100, situacao: "concluida" },
  { id: 2, quantidade: 50, situacao: "aberta" },
], truncado: false }) } as any;

describe("consultarProducao", () => {
  it("soma quantidade e conta ordens do período", async () => {
    const r = await consultarProducao({ client, hoje: REF }, { periodo: "esta_semana", situacao: "todas" });
    expect(r.numeroOrdens).toBe(2);
    expect(r.quantidadeTotal).toBe(150);
  });
});
