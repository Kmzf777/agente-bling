import { toolDefinitions, executarTool, type ToolDeps } from "./tools";
import { montarSystemPrompt } from "./systemPrompt";

export interface Mensagem { role: "user" | "assistant"; content: any; }
export interface RunAgentParams {
  anthropic: { messages: { create: (body: any) => Promise<any> } };
  model: string;
  mensagens: Mensagem[];
  deps: ToolDeps;
  maxToolCalls?: number;
  hoje?: Date;
}

export async function runAgent(p: RunAgentParams): Promise<{ texto: string }> {
  const maxToolCalls = p.maxToolCalls ?? 8;
  const system = [{ type: "text", text: montarSystemPrompt(p.hoje), cache_control: { type: "ephemeral" } }];
  const tools = toolDefinitions.map((t, i) =>
    i === toolDefinitions.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t);
  const messages: Mensagem[] = [...p.mensagens];

  for (let i = 0; i < maxToolCalls; i++) {
    const resp = await p.anthropic.messages.create({ model: p.model, max_tokens: 2048, system, tools, messages });
    if (resp.stop_reason !== "tool_use") return { texto: extrairTexto(resp) };

    messages.push({ role: "assistant", content: resp.content });
    const toolResults = [];
    for (const bloco of resp.content) {
      if (bloco.type !== "tool_use") continue;
      try {
        const resultado = await executarTool(bloco.name, bloco.input, p.deps);
        toolResults.push({ type: "tool_result", tool_use_id: bloco.id, content: JSON.stringify(resultado) });
      } catch (e) {
        toolResults.push({ type: "tool_result", tool_use_id: bloco.id, is_error: true, content: String(e) });
      }
    }
    if (toolResults.length === 0) return { texto: extrairTexto(resp) };
    messages.push({ role: "user", content: toolResults });
  }
  return { texto: "Não consegui concluir por atingir o limite de consultas. Tente refinar a pergunta." };
}

function extrairTexto(resp: any): string {
  return (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim()
    || "Sem resposta.";
}
