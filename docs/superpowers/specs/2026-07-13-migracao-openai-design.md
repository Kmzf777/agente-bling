# Migração Anthropic → OpenAI (Agente Bling Café)

- **Data:** 2026-07-13
- **Status:** Aprovado (spec + plano pré-aprovados pelo usuário)

## Objetivo
Trocar o provedor de LLM do agente de **Anthropic (Claude)** para **OpenAI**, usando a
**Chat Completions API** com *function calling*. Modelo padrão **`gpt-4.1-mini`**, configurável
por `OPENAI_MODEL`. Comportamento do agente (ferramentas, prompt, guardrails) permanece o mesmo.

## Escopo
**Muda:**
- `src/agent/claudeClient.ts` → **renomeado para `src/agent/agentLoop.ts`**: `runAgent` recebe
  `openai` e usa `chat.completions.create`. Loop de *tool calls* no formato OpenAI. Remove
  `cache_control` (OpenAI faz cache automático).
- `src/agent/tools.ts`: `toolDefinitions` no formato OpenAI (`{ type:"function", function:{ name,
  description, parameters } }`). O dispatcher `executarTool` **não muda**.
- `src/config.ts`: `openaiApiKey` (`OPENAI_API_KEY`, obrigatório) + `openaiModel`
  (`OPENAI_MODEL`, default `gpt-4.1-mini`); remove campos Anthropic.
- `src/bootstrap.ts`: instancia `new OpenAI({ apiKey })`; passa `openai` ao `runAgent`.
- **Carregamento de `.env`:** adicionar `dotenv` + `import "dotenv/config"` no topo de
  `bootstrap.ts` e `authSetup.ts` (hoje nada popula `process.env` → `npm start` quebraria).
- `package.json`: adiciona `openai` e `dotenv`; remove `@anthropic-ai/sdk`.
- `.env.example`: `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4.1-mini` (remove `ANTHROPIC_*`).
- Testes: `claudeClient.test.ts` → `agentLoop.test.ts` (mock no formato OpenAI); `tools.test.ts`
  (novo schema); `config.test.ts` (novas variáveis).
- `README.md`: menções Claude/Anthropic → OpenAI.

**Não muda:** `systemPrompt.ts`, `executarTool`, todas as ferramentas/Bling, auth/CORS, frontend.

## Detalhes técnicos (Chat Completions)
- Mensagens: `[{role:"system", content: systemPrompt}, ...conversa]`.
- `tools`: array de `{ type:"function", function:{ name, description, parameters } }`.
- Resposta: `resp.choices[0].message`. Se `message.tool_calls?.length`, para cada tool call:
  `JSON.parse(tc.function.arguments)` → `executarTool(tc.function.name, args, deps)` →
  anexar `{ role:"tool", tool_call_id: tc.id, content: JSON.stringify(resultado) }`. Repetir
  até não haver `tool_calls` (então retorna `message.content`), respeitando `maxToolCalls`.
- Erro de ferramenta → `content` do `tool` com a mensagem de erro (o modelo lida).

## Testes
- **Unit (mockados):** `agentLoop` com `openai.chat.completions.create` fake (1ª resposta com
  `tool_calls`, 2ª com texto) — confirma execução da ferramenta com args parseados e texto final;
  teste do teto de `maxToolCalls`. `tools` (schema OpenAI). `config` (novas variáveis).
- **Smoke ao vivo:** uma chamada real mínima ao OpenAI (`gpt-4.1-mini`) para confirmar a chave e a
  disponibilidade do modelo na conta.

## Fora de escopo
Responses API · streaming · mudar frontend/Bling/auth · trocar o comportamento do agente.
