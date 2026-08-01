import { describe, it, expect } from "vitest";
import { normalizaTelefoneMeta } from "../src/util/telefoneMeta";

describe("normalizaTelefoneMeta", () => {
  it("celular com máscara vira 55 + DDD + número (só dígitos)", () => {
    expect(normalizaTelefoneMeta("(42) 99847-6388")).toEqual({
      numero: "5542998476388", valido: true, tipo: "movel",
    });
  });
  it("fixo de 10 dígitos recebe 55 e é marcado como fixo", () => {
    expect(normalizaTelefoneMeta("4232251234")).toEqual({
      numero: "554232251234", valido: true, tipo: "fixo",
    });
  });
  it("número que já tem 55 é mantido", () => {
    expect(normalizaTelefoneMeta("5542998476388")).toEqual({
      numero: "5542998476388", valido: true, tipo: "movel",
    });
  });
  it("número com +55 e máscara é normalizado", () => {
    expect(normalizaTelefoneMeta("+55 (42) 99847-6388")).toEqual({
      numero: "5542998476388", valido: true, tipo: "movel",
    });
  });
  it("sem DDD (9 dígitos) é inválido", () => {
    const r = normalizaTelefoneMeta("99847-6388");
    expect(r.valido).toBe(false);
    expect(r.numero).toBe("998476388");
  });
  it("vazio é inválido", () => {
    expect(normalizaTelefoneMeta("")).toEqual({ numero: "", valido: false, tipo: "desconhecido" });
  });
  it("lixo sem dígitos é inválido", () => {
    expect(normalizaTelefoneMeta("sem telefone")).toEqual({ numero: "", valido: false, tipo: "desconhecido" });
  });
  it("dígitos demais é inválido mas preserva o que capturou", () => {
    const r = normalizaTelefoneMeta("555542998476388999");
    expect(r.valido).toBe(false);
  });
});
