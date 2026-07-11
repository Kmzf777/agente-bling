import { describe, it, expect } from "vitest";
import { runAgent } from "../src/agent/claudeClient";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = { getAllPages: async () => [{ total: 100 }] } as any;

function anthropicMock() {
  const seen: any[] = [];
  let call = 0;
  return {
    seen,
    messages: {
      create: async (body: any) => {
        seen.push(body);
        call++;
        if (call === 1) return {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", id: "t1", name: "consultar_vendas", input: { periodo: "hoje" } }],
        };
        return { stop_reason: "end_turn", content: [{ type: "text", text: "Você vendeu R$ 100 hoje." }] };
      },
    },
  };
}

describe("runAgent", () => {
  it("executa a ferramenta pedida e retorna o texto final", async () => {
    const anthropic = anthropicMock();
    const r = await runAgent({
      anthropic: anthropic as any, model: "claude-haiku-4-5",
      mensagens: [{ role: "user", content: "quanto vendi hoje?" }],
      deps: { client, situacoesFaturado: [9], hoje: REF }, hoje: REF,
    });
    expect(r.texto).toContain("R$ 100");
    const segunda = anthropic.seen[1];
    const temToolResult = segunda.messages.some((m: any) =>
      Array.isArray(m.content) && m.content.some((c: any) => c.type === "tool_result"));
    expect(temToolResult).toBe(true);
  });

  it("respeita o teto de chamadas de ferramenta", async () => {
    let call = 0;
    const anthropic = { messages: { create: async () => { call++; return {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "x" + call, name: "consultar_vendas", input: { periodo: "hoje" } }],
    }; } } };
    const r = await runAgent({
      anthropic: anthropic as any, model: "m",
      mensagens: [{ role: "user", content: "loop" }],
      deps: { client, situacoesFaturado: [], hoje: REF }, maxToolCalls: 3, hoje: REF,
    });
    expect(call).toBeLessThanOrEqual(4);
    expect(r.texto).toMatch(/limite|não consegui|tente/i);
  });
});
