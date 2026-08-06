# CLAUDE.md — Agente Bling Café

Assistente de IA (Telegram + web) que responde perguntas de gestão de uma torrefação de café
usando dados **ao vivo** do ERP **Bling** (API v3). Backend Node + TypeScript (Express) rodando um
agente autônomo (Claude via Vercel AI SDK). Frontend React + Vite. Deploy automático na VPS via
GitHub Actions em push na `main`.

## ⛔ REGRA ABSOLUTA: SOMENTE LEITURA NO BLING

**É EXTREMAMENTE PROIBIDO criar, desenvolver ou permitir QUALQUER operação que INSIRA, ALTERE ou
EXCLUA dados no Bling. O agente e todo o código SÓ PODEM VISUALIZAR (ler) dados da API.**

Isso não é negociável. Ao mexer em qualquer parte do código:

- **NUNCA** use métodos HTTP de escrita (`POST`, `PUT`, `PATCH`, `DELETE`) contra a API do Bling.
  O `BlingClient` (`src/bling/blingClient.ts`) expõe **apenas** `get` e `getAllPages` — não adicione
  verbos de escrita.
- **NUNCA** adicione endpoints de escrita em `src/bling/endpoints.ts` (só `listar*`/`obter*` = GET).
- O escape hatch `bling_consultar_api` é guardado por `validarPathLeitura`
  (`src/bling/readOnlyGuard.ts`), uma whitelist de recursos de LEITURA. **Não afrouxe esse guard**
  para permitir escrita, e mantenha a whitelist só com recursos de consulta.
- Ao criar uma ferramenta nova, ela só pode **consultar**. Se um pedido do usuário exigir escrever
  no Bling, **recuse** e explique que o agente é somente-leitura.
- Defense-in-depth: mesmo que uma camada falhe, as outras impedem escrita. Mantenha as três
  (sem verbos de escrita no client, só GET nos endpoints, whitelist no guard).

## Arquitetura (orientação rápida)

- `src/bling/blingClient.ts` — HTTP client com throttle (~2,5 req/s), retry 401/429. **Só GET.**
- `src/bling/endpoints.ts` — funções tipadas por recurso (todas GET).
- `src/bling/tokenManager.ts` — OAuth2; token em `.bling-tokens.json` (gitignored, por ambiente),
  refresh automático (o Bling rotaciona o refresh_token a cada uso).
- `src/tools/consultar*.ts` — uma ferramenta pura por assunto (vendas, NF, compras, estoque…).
- `src/agent/tools.ts` — registra as ferramentas no formato do AI SDK.
- `src/agent/systemPrompt.ts` / `router.ts` — prompt e roteamento Haiku (simples) × Sonnet (análise).

## Notas fiscais: NF-e (modelo 55) + NFC-e (modelo 65, varejo)

`consultarNotasFiscais` consulta os dois recursos (`/nfe` e `/nfce`) em paralelo com
`Promise.allSettled` — se um falhar (ex.: permissão), segue com o outro e devolve `avisos`.
Valor da venda = soma do `valorTotal` (linha) dos itens com CFOP de venda (5.1/6.1/5.4/6.4);
`valor` no item é o UNITÁRIO. Ver [`docs/superpowers/specs/`](docs/superpowers/specs/) para specs.

## Deploy

Push na `main` → GitHub Actions roda testes e faz deploy na VPS (`git reset --hard origin/main`
+ `npm ci` + `pm2 reload`). **Confirme sempre que o deploy concluiu com sucesso** (o job de deploy
pode falhar e deixar a produção no commit anterior). O token do Bling da VPS é separado do local.

## Testes

`npm test` (vitest) · `npm run typecheck` (tsc). Siga TDD ao mexer nas ferramentas.
