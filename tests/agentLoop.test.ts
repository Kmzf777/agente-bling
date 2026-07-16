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
    expect(captured.system).toBeUndefined();
    expect(captured.allowSystemInMessages).toBe(true);
    expect(captured.messages[0]).toEqual({
      role: "system",
      content: "SYS",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } } },
    });
    expect(captured.messages[1]).toEqual({
      role: "user",
      content: "x",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } } },
    });
    expect(Object.keys(captured.tools)).toContain("consultar_notas_fiscais");
    expect(captured.stopWhen).toBeTruthy();
  });

  it("emite evento de custo a partir do usage (com cache read/write)", async () => {
    const streamTextImpl: any = () => ({
      text: Promise.resolve("ok"),
      fullStream: undefined,
      totalUsage: Promise.resolve({ inputTokens: 1000, outputTokens: 500, cachedInputTokens: 2000 }),
      steps: Promise.resolve([{ providerMetadata: { anthropic: { cacheCreationInputTokens: 4000 } } }]),
    });
    const eventos: any[] = [];
    await runAgent({
      model: {} as any, systemPrompt: "s", mensagens: [{ role: "user", content: "x" }],
      deps: depsBase, usdBrl: 5, onEvent: (e) => eventos.push(e), streamTextImpl,
    });
    const custo = eventos.find((e) => e.tipo === "custo");
    expect(custo).toBeTruthy();
    // (1000*3 + 500*15 + 2000*0.30 + 4000*3.75)/1e6 = 26100/1e6 = 0.0261
    expect(custo.usd).toBeCloseTo(0.0261, 6);
    expect(custo.brl).toBeCloseTo(0.1305, 6);
    expect(custo.cacheRead).toBe(2000);
    expect(custo.cacheWrite).toBe(4000);
  });
});
