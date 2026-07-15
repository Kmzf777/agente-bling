import { describe, it, expect } from "vitest";
import { resolverPeriodo } from "../src/util/periodo";

// Quarta-feira, 2026-07-08
const REF = new Date("2026-07-08T12:00:00-03:00");

describe("resolverPeriodo", () => {
  it("hoje", () => expect(resolverPeriodo("hoje", REF)).toEqual({ dataInicial: "2026-07-08", dataFinal: "2026-07-08" }));
  it("ontem", () => expect(resolverPeriodo("ontem", REF)).toEqual({ dataInicial: "2026-07-07", dataFinal: "2026-07-07" }));
  it("esta_semana (segunda a hoje)", () =>
    expect(resolverPeriodo("esta_semana", REF)).toEqual({ dataInicial: "2026-07-06", dataFinal: "2026-07-08" }));
  it("semana_passada (segunda a domingo)", () =>
    expect(resolverPeriodo("semana_passada", REF)).toEqual({ dataInicial: "2026-06-29", dataFinal: "2026-07-05" }));
  it("este_mes", () =>
    expect(resolverPeriodo("este_mes", REF)).toEqual({ dataInicial: "2026-07-01", dataFinal: "2026-07-08" }));
  it("mes_passado", () =>
    expect(resolverPeriodo("mes_passado", REF)).toEqual({ dataInicial: "2026-06-01", dataFinal: "2026-06-30" }));
  it("personalizado usa as datas fornecidas", () =>
    expect(resolverPeriodo("personalizado", REF, "2026-01-01", "2026-01-31"))
      .toEqual({ dataInicial: "2026-01-01", dataFinal: "2026-01-31" }));
  it("lança erro claro para período fora do enum (em vez de retornar undefined)", () =>
    expect(() => resolverPeriodo("semana" as any, REF)).toThrow(/inválido/));
});
