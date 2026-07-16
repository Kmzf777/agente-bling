import { streamText, stepCountIs, type LanguageModel } from "ai";
import { construirTools, type ToolDeps } from "./tools";
import { resumirResultado } from "./resumo";

export interface Mensagem { role: "user" | "assistant"; content: any; }
export type AgentEvent =
  | { tipo: "tool_inicio"; id: string; nome: string; args: unknown }
  | { tipo: "tool_fim"; id: string; resumo: string }
  | { tipo: "texto"; delta: string };

export interface RunAgentParams {
  model: LanguageModel;
  mensagens: Mensagem[];
  deps: ToolDeps;
  systemPrompt: string;
  maxSteps?: number;
  onEvent?: (ev: AgentEvent) => void;
  streamTextImpl?: typeof streamText; // injeção para testes
}

/**
 * Loop agêntico multi-step sobre o Vercel AI SDK. O modelo planeja, chama tools do Bling,
 * observa e refina até responder (até maxSteps passos). Quando onEvent é fornecido, emite
 * eventos de tool-call e de texto (para streaming na UI).
 */
export async function runAgent(p: RunAgentParams): Promise<{ texto: string }> {
  const impl = p.streamTextImpl ?? streamText;
  const result: any = await impl({
    model: p.model,
    system: p.systemPrompt,
    messages: p.mensagens as any,
    tools: construirTools(p.deps),
    stopWhen: stepCountIs(p.maxSteps ?? 20),
  });

  if (p.onEvent && result.fullStream) {
    for await (const part of result.fullStream) {
      if (part.type === "tool-call") p.onEvent({ tipo: "tool_inicio", id: part.toolCallId, nome: part.toolName, args: part.input });
      else if (part.type === "tool-result") p.onEvent({ tipo: "tool_fim", id: part.toolCallId, resumo: resumirResultado(part.toolName, part.output) });
      else if (part.type === "text-delta") p.onEvent({ tipo: "texto", delta: part.text ?? "" });
    }
  }

  const texto = (await result.text)?.trim() || "Sem resposta.";
  return { texto };
}
