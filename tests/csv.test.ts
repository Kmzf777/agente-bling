import { describe, it, expect } from "vitest";
import { paraCsv } from "../src/util/csv";

describe("paraCsv", () => {
  it("monta cabeçalho e linhas separados por vírgula, com CRLF", () => {
    const csv = paraCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe("a,b\r\n1,2\r\n3,4");
  });
  it("escapa campos com vírgula entre aspas", () => {
    const csv = paraCsv(["nome"], [["Silva, João"]]);
    expect(csv).toBe('nome\r\n"Silva, João"');
  });
  it("duplica aspas internas e envolve em aspas", () => {
    const csv = paraCsv(["x"], [['diz "oi"']]);
    expect(csv).toBe('x\r\n"diz ""oi"""');
  });
  it("envolve campos com quebra de linha", () => {
    const csv = paraCsv(["x"], [["linha1\nlinha2"]]);
    expect(csv).toBe('x\r\n"linha1\nlinha2"');
  });
  it("números viram texto e vazio/null viram string vazia", () => {
    const csv = paraCsv(["n", "v"], [[3, null], [0, undefined]]);
    expect(csv).toBe("n,v\r\n3,\r\n0,");
  });
});
