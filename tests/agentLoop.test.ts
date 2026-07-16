import { describe, it, expect } from "vitest";
import { runAgent } from "../src/agent/agentLoop";

const depsBase = { client: {} as any, situacoesFaturado: [] as number[] };

describe("runAgent (AI SDK)", () => {
  it("retorna o texto final do modelo (streamText injetado)", async () => {
    const streamTextImpl: any = () => ({ text: Promise.resolve("Você vendeu R$ 100 hoje."), fullStream: undefined });
    const r = await runAgent({
      model: {} as any, systemPrompt: "sys",
      mensagens: [{ role: "user", content: "quanto vendi?" }],
      deps: depsBase, streamTextImpl,
    });
    expect(r.texto).toContain("R$ 100");
  });

  it("emite tool_inicio (com args) e tool_fim (com resumo) a partir do fullStream", async () => {
    async function* fs() {
      yield { type: "tool-call", toolCallId: "c1", toolName: "consultar_vendas", input: { periodo: "hoje" } };
      yield { type: "tool-result", toolCallId: "c1", toolName: "consultar_vendas", output: { numeroPedidos: 2, valorTotal: 150 } };
      yield { type: "text-delta", text: "pronto" };
    }
    const streamTextImpl: any = () => ({ text: Promise.resolve("pronto"), fullStream: fs() });
    const eventos: any[] = [];
    const r = await runAgent({
      model: {} as any, systemPrompt: "sys",
      mensagens: [{ role: "user", content: "oi" }],
      deps: depsBase, onEvent: (e) => eventos.push(e), streamTextImpl,
    });
    expect(r.texto).toBe("pronto");
    expect(eventos).toEqual([
      { tipo: "tool_inicio", id: "c1", nome: "consultar_vendas", args: { periodo: "hoje" } },
      { tipo: "tool_fim", id: "c1", resumo: "2 pedidos · R$ 150" },
      { tipo: "texto", delta: "pronto" },
    ]);
  });

  it("passa system, messages, tools e stopWhen ao streamText", async () => {
    let captured: any;
    const streamTextImpl: any = (opts: any) => { captured = opts; return { text: Promise.resolve("ok"), fullStream: undefined }; };
    await runAgent({
      model: { id: "m" } as any, systemPrompt: "SYS",
      mensagens: [{ role: "user", content: "x" }],
      deps: depsBase, maxSteps: 7, streamTextImpl,
    });
    expect(captured.system).toBe("SYS");
    expect(captured.messages).toEqual([{ role: "user", content: "x" }]);
    expect(Object.keys(captured.tools)).toContain("consultar_notas_fiscais");
    expect(captured.stopWhen).toBeTruthy();
  });
});
