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
  // Prompt caching (Anthropic): cacheia o system — que cobre tools+system e é reenviado a
  // CADA passo do loop — e a última mensagem (prefixo do histórico multi-turn). O trecho
  // repetido passa a custar ~0,1× em vez do preço cheio, cortando o custo de input.
  const cache = { anthropic: { cacheControl: { type: "ephemeral" as const } } };
  const ultima = p.mensagens.length - 1;
  const mensagens: any[] = [
    { role: "system", content: p.systemPrompt, providerOptions: cache },
    ...p.mensagens.map((m, i) => (i === ultima ? { ...m, providerOptions: cache } : m)),
  ];
  const result: any = await impl({
    model: p.model,
    messages: mensagens,
    allowSystemInMessages: true,
    tools: construirTools(p.deps),
    stopWhen: stepCountIs(p.maxSteps ?? 20),
  } as any);

  if (p.onEvent && result.fullStream) {
    for await (const part of result.fullStream) {
      if (part.type === "tool-call") p.onEvent({ tipo: "tool_inicio", id: part.toolCallId, nome: part.toolName, args: part.input });
      else if (part.type === "tool-result") p.onEvent({ tipo: "tool_fim", id: part.toolCallId, resumo: resumirResultado(part.toolName, part.output) });
      else if (part.type === "text-delta") p.onEvent({ tipo: "texto", delta: part.text ?? "" });
    }
  }

  const texto = (await result.text)?.trim() || "Sem resposta.";
  // Observabilidade de custo: mostra quanto do input veio do cache (cacheRead alto = barato).
  try {
    const u: any = await result.usage;
    if (u) console.log(`[agent] tokens: in=${u.inputTokens ?? "?"} out=${u.outputTokens ?? "?"} cacheRead=${u.cachedInputTokens ?? 0}`);
  } catch { /* usage é opcional */ }
  return { texto };
}
