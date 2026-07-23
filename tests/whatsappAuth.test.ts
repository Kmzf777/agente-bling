import { describe, it, expect } from "vitest";
import { decidirAuth } from "../src/whatsapp/auth";

describe("decidirAuth (senha na 1ª mensagem)", () => {
  const senha = "cafe123";

  it("já autenticado → segue", () => {
    expect(decidirAuth({ autenticado: true }, "quanto vendi hoje?", senha)).toBe("seguir");
  });

  it("não autenticado + senha correta → autentica", () => {
    expect(decidirAuth({ autenticado: false }, "cafe123", senha)).toBe("autenticar");
  });

  it("não autenticado + senha correta com espaços → autentica", () => {
    expect(decidirAuth({ autenticado: false }, "  cafe123 ", senha)).toBe("autenticar");
  });

  it("não autenticado + texto errado → pede senha", () => {
    expect(decidirAuth({ autenticado: false }, "oi", senha)).toBe("pedir_senha");
  });
});
