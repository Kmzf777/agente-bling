# Migração Anthropic → OpenAI — Plano de Implementação

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps com checkbox.

**Goal:** Substituir o provedor de LLM (Anthropic → OpenAI Chat Completions), modelo padrão `gpt-4.1-mini`, mantendo todo o comportamento do agente. Corrigir também o carregamento de `.env` (dotenv).

**Tech Stack:** Node+TS, `openai` SDK, `dotenv`, vitest. Execução via `tsx`.

---

### Task 1: Dependências e config
- [ ] `npm install openai dotenv` e `npm uninstall @anthropic-ai/sdk`.
- [ ] `src/config.ts`: `openaiApiKey`/`openaiModel` (default `gpt-4.1-mini`); `REQUIRED` troca `ANTHROPIC_API_KEY` por `OPENAI_API_KEY`; remove campos Anthropic.
- [ ] `tests/config.test.ts`: atualizar para `OPENAI_API_KEY` / `openaiModel === "gpt-4.1-mini"`.
- [ ] Rodar `npm test tests/config.test.ts` (verde), commit.

### Task 2: Tools no formato OpenAI
- [ ] `src/agent/tools.ts`: `toolDefinitions` vira `{ type:"function", function:{ name, description, parameters } }` (mesmos nomes/descrições/schemas; `input_schema` → `parameters`). `executarTool` inalterado.
- [ ] `tests/tools.test.ts`: checar `t.type === "function"`, `t.function.name`, `t.function.parameters.type === "object"`; dispatcher igual.
- [ ] `npm test tests/tools.test.ts` (verde), commit.

### Task 3: Loop do agente (rename + OpenAI) + bootstrap + dotenv
- [ ] `git mv src/agent/claudeClient.ts src/agent/agentLoop.ts` e reescrever para Chat Completions (ver spec). `runAgent({ openai, model, mensagens, deps, maxToolCalls?, hoje? })`.
- [ ] `tests/claudeClient.test.ts` → `tests/agentLoop.test.ts` com mock OpenAI (tool_calls → texto) + teste do teto.
- [ ] `src/bootstrap.ts`: `import "dotenv/config"` no topo; `new OpenAI({ apiKey: cfg.openaiApiKey })`; import de `./agent/agentLoop`; `runAgent({ openai, model: cfg.openaiModel, ... })`.
- [ ] `src/bling/authSetup.ts`: `import "dotenv/config"` no topo.
- [ ] `npm test` (tudo verde) + `npx tsc --noEmit` (limpo), commit.

### Task 4: .env.example, README
- [ ] `.env.example`: `OPENAI_API_KEY=` / `OPENAI_MODEL=gpt-4.1-mini`; remover `ANTHROPIC_*`.
- [ ] `README.md`: trocar menções Claude/Anthropic → OpenAI; citar `OPENAI_API_KEY`/`OPENAI_MODEL`.
- [ ] Commit.

### Task 5: Verificação
- [ ] `npm test` (todos) + `npx tsc --noEmit`.
- [ ] Smoke ao vivo: script efêmero chamando `openai.chat.completions.create({model:"gpt-4.1-mini", messages:[{role:"user",content:"responda 'ok'"}]})` com a chave do `.env`, confirmando resposta (valida chave + disponibilidade do modelo).
