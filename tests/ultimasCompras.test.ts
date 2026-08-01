import { describe, it, expect } from "vitest";
import { ultimasCompras } from "../src/util/ultimasCompras";

describe("ultimasCompras", () => {
  it("agrupa por contato e retorna as datas em ordem decrescente", () => {
    const m = ultimasCompras([
      { contatoId: 1, data: "2026-01-10" },
      { contatoId: 1, data: "2026-03-05" },
      { contatoId: 2, data: "2025-12-01" },
    ]);
    expect(m.get(1)).toEqual(["2026-03-05", "2026-01-10"]);
    expect(m.get(2)).toEqual(["2025-12-01"]);
  });
  it("limita às n mais recentes (padrão 3)", () => {
    const m = ultimasCompras([
      { contatoId: 7, data: "2026-01-01" },
      { contatoId: 7, data: "2026-02-01" },
      { contatoId: 7, data: "2026-03-01" },
      { contatoId: 7, data: "2026-04-01" },
    ]);
    expect(m.get(7)).toEqual(["2026-04-01", "2026-03-01", "2026-02-01"]);
  });
  it("respeita n customizado", () => {
    const m = ultimasCompras([
      { contatoId: 7, data: "2026-01-01" },
      { contatoId: 7, data: "2026-02-01" },
    ], 1);
    expect(m.get(7)).toEqual(["2026-02-01"]);
  });
  it("mantém compras no mesmo dia como entradas distintas", () => {
    const m = ultimasCompras([
      { contatoId: 3, data: "2026-05-05" },
      { contatoId: 3, data: "2026-05-05" },
    ]);
    expect(m.get(3)).toEqual(["2026-05-05", "2026-05-05"]);
  });
  it("ignora pedidos sem contato ou sem data", () => {
    const m = ultimasCompras([
      { contatoId: 0, data: "2026-05-05" },
      { contatoId: 4, data: "" },
      { contatoId: 4, data: "2026-06-06" },
    ] as any);
    expect(m.has(0)).toBe(false);
    expect(m.get(4)).toEqual(["2026-06-06"]);
  });
});
