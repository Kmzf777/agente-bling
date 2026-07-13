import { describe, it, expect } from "vitest";
import { runAgent } from "../src/agent/agentLoop";

const REF = new Date("2026-07-08T12:00:00-03:00");
const client = { getAllPages: async () => [{ total: 100 }] } as any;

function openaiMock() {
  const seen: any[] = [];
  let call = 0;
  return {
    seen,
    chat: {
      completions: {
        create: async (body: any) => {
          seen.push(body);
          call++;
          if (call === 1) return {
            choices: [{
              finish_reason: "tool_calls",
              message: {
                role: "assistant", content: null,
                tool_calls: [{ id: "t1", type: "function", function: { name: "consultar_vendas", arguments: JSON.stringify({ periodo: "hoje" }) } }],
              },
            }],
          };
          return { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Você vendeu R$ 100 hoje." } }] };
        },
      },
    },
  };
}

describe("runAgent (OpenAI)", () => {
  it("executa a ferramenta pedida e retorna o texto final", async () => {
    const openai = openaiMock();
    const r = await runAgent({
      openai: openai as any, model: "gpt-4.1-mini",
      mensagens: [{ role: "user", content: "quanto vendi hoje?" }],
      deps: { client, situacoesFaturado: [9], hoje: REF }, hoje: REF,
    });
    expect(r.texto).toContain("R$ 100");
    const segunda = openai.seen[1];
    const temToolResult = segunda.messages.some((m: any) => m.role === "tool");
    expect(temToolResult).toBe(true);
  });

  it("respeita o teto de chamadas de ferramenta", async () => {
    let call = 0;
    const openai = { chat: { completions: { create: async () => { call++; return {
      choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null,
        tool_calls: [{ id: "x" + call, type: "function", function: { name: "consultar_vendas", arguments: "{\"periodo\":\"hoje\"}" } }] } }],
    }; } } } };
    const r = await runAgent({
      openai: openai as any, model: "m",
      mensagens: [{ role: "user", content: "loop" }],
      deps: { client, situacoesFaturado: [], hoje: REF }, maxToolCalls: 3, hoje: REF,
    });
    expect(call).toBe(3);
    expect(r.texto).toMatch(/limite|não consegui|tente/i);
  });
});
