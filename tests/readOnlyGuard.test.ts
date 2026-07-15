import { describe, it, expect } from "vitest";
import { validarPathLeitura } from "../src/bling/readOnlyGuard";

describe("readOnlyGuard", () => {
  it("aceita paths de leitura conhecidos", () => {
    expect(validarPathLeitura("/nfe")).toBe(true);
    expect(validarPathLeitura("/nfe/123")).toBe(true);
    expect(validarPathLeitura("/contas/pagar")).toBe(true);
    expect(validarPathLeitura("/pedidos/vendas/123")).toBe(true);
    expect(validarPathLeitura("/produtos?pagina=2")).toBe(true);
  });
  it("rejeita paths desconhecidos ou suspeitos", () => {
    expect(validarPathLeitura("/usuarios")).toBe(false);
    expect(validarPathLeitura("/qualquer/coisa")).toBe(false);
    expect(validarPathLeitura("../secret")).toBe(false);
    expect(validarPathLeitura("pedidos/vendas")).toBe(false);
  });
});
