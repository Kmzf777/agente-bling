import { toolDefinitions, executarTool, type ToolDeps } from "./tools";
import { montarSystemPrompt } from "./systemPrompt";

export interface Mensagem { role: "user" | "assistant"; content: any; }
export interface RunAgentParams {
  openai: { chat: { completions: { create: (body: any) => Promise<any> } } };
  model: string;
  mensagens: Mensagem[];
  deps: ToolDeps;
  maxToolCalls?: number;
  hoje?: Date;
}

export async function runAgent(p: RunAgentParams): Promise<{ texto: string }> {
  const maxToolCalls = p.maxToolCalls ?? 8;
  const messages: any[] = [
    { role: "system", content: montarSystemPrompt(p.hoje) },
    ...p.mensagens,
  ];

  for (let i = 0; i < maxToolCalls; i++) {
    const resp = await p.openai.chat.completions.create({
      model: p.model,
      messages,
      tools: toolDefinitions,
    });
    const msg = resp.choices[0].message;
    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) return { texto: (msg.content ?? "").trim() || "Sem resposta." };

    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let content: string;
      try {
        const args = JSON.parse(tc.function.arguments || "{}");
        const resultado = await executarTool(tc.function.name, args, p.deps);
        content = JSON.stringify(resultado);
      } catch (e) {
        content = `Erro ao executar ${tc.function?.name}: ${String(e)}`;
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content });
    }
  }
  return { texto: "Não consegui concluir por atingir o limite de consultas. Tente refinar a pergunta." };
}
