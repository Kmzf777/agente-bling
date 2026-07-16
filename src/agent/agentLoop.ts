import { streamText, stepCountIs, type LanguageModel } from "ai";
import { construirTools, type ToolDeps } from "./tools";
import { resumirResultado } from "./resumo";
import { calcularCusto } from "./custo";

export interface Mensagem { role: "user" | "assistant"; content: any; }
export type AgentEvent =
  | { tipo: "tool_inicio"; id: string; nome: string; args: unknown }
  | { tipo: "tool_fim"; id: string; resumo: string }
  | { tipo: "texto"; delta: string }
  | { tipo: "custo"; usd: number; brl: number; entrada: number; saida: number; cacheRead: number; cacheWrite: number };

export interface RunAgentParams {
  model: LanguageModel;
  mensagens: Mensagem[];
  deps: ToolDeps;
  systemPrompt: string;
  maxSteps?: number;
  usdBrl?: number; // taxa fixa USD→BRL para exibir o custo estimado em reais
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
  // Custo da resposta: usa o usage agregado (entrada/saída/cache-read somados nos passos)
  // + o cache-write somado dos passos. Emite um evento "custo" para o frontend exibir.
  try {
    const u: any = (await result.totalUsage) ?? (await result.usage);
    if (u) {
      let cacheWrite = 0;
      try {
        const steps: any[] = (await result.steps) ?? [];
        for (const s of steps) cacheWrite += Number(s?.providerMetadata?.anthropic?.cacheCreationInputTokens ?? 0);
      } catch { /* steps é opcional */ }
      const custo = calcularCusto({
        inputTokens: Number(u.inputTokens) || 0,
        outputTokens: Number(u.outputTokens) || 0,
        cacheReadTokens: Number(u.cachedInputTokens) || 0,
        cacheWriteTokens: cacheWrite,
      });
      console.log(`[agent] tokens: in=${custo.inputTokens} out=${custo.outputTokens} cacheRead=${custo.cacheReadTokens} cacheWrite=${custo.cacheWriteTokens} → US$ ${custo.usd.toFixed(6)}`);
      p.onEvent?.({
        tipo: "custo",
        usd: custo.usd,
        brl: Math.round(custo.usd * (p.usdBrl ?? 5.6) * 1e6) / 1e6,
        entrada: custo.inputTokens,
        saida: custo.outputTokens,
        cacheRead: custo.cacheReadTokens,
        cacheWrite: custo.cacheWriteTokens,
      });
    }
  } catch { /* custo é opcional */ }
  return { texto };
}
