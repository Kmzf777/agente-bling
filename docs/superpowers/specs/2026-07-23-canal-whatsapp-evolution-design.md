# Canal WhatsApp via Evolution API — Design

**Data:** 2026-07-23
**Status:** Aprovado

## Objetivo

Adicionar um **canal WhatsApp** ao agente Bling Café existente, reaproveitando o mesmo
`runAgent({ mensagens })`. O usuário conversa com o agente pelo WhatsApp em linguagem natural
(vendas, faturamento, estoque, produção, NF-e, financeiro) e recebe as respostas ao vivo do Bling —
exatamente as mesmas capacidades do chat web, num novo canal.

A Evolution API é self-hostada junto do projeto (Docker), rodando na mesma máquina do backend.

## Contexto / o que já existe

- Backend Node + TypeScript (Express) em `src/server.ts` / `src/bootstrap.ts`.
- Agente reutilizável: `runAgent({ mensagens })` em `src/agent/agentLoop.ts` (loop multi-step,
  tools do Bling, roteamento Haiku/Sonnet por complexidade).
- Hoje há **um canal**: chat web protegido por `APP_PASSWORD`, histórico no navegador, sem banco.
- Filosofia do projeto: **somente leitura** no Bling, **sem banco de dados** no backend.

Este canal **não** altera nada disso — só pluga uma nova entrada de mensagens no mesmo `runAgent`.

## Topologia (tudo local, sem ngrok para o WhatsApp)

```
WhatsApp  ⇄  Evolution API (Docker)  →  webhook  →  Backend Node (:3000)  →  runAgent → Bling
                     ↑                                       │
                  Postgres (Docker)          sendText  ◄─────┘  (resposta volta pela Evolution)
```

- Docker sobe **Evolution API + Postgres**. O backend continua rodando via `npm start`.
- A Evolution conecta ao WhatsApp por conexão **de saída** (Baileys) — não precisa de URL pública.
- A Evolution chama o backend em `http://host.docker.internal:3000/api/whatsapp/webhook`.
- **Nada é exposto para a internet** — ngrok **não** é necessário para o canal WhatsApp
  (diferente do frontend web na Vercel). ngrok só faria falta se a Evolution rodasse em outra
  máquina ou se quiséssemos acessar o manager da Evolution de fora.

## Decisões de design

| Tema | Decisão |
|---|---|
| Integração | **Webhook no mesmo backend** (Opção A). Uma rota Express nova chama o `runAgent` já montado. Um processo só. |
| Acesso | **Senha na 1ª mensagem.** Cada número precisa enviar `WHATSAPP_ACCESS_PASSWORD` antes de liberar a sessão. Números não autenticados nunca chegam ao agente. |
| Memória | **Em memória + timeout.** Histórico por número na RAM, expira após inatividade (padrão 30 min). Coerente com "sem banco". Perde ao reiniciar o backend (aceitável). |
| Resposta | **Sem streaming.** Uma mensagem final via `sendText`. Ack imediato "🔎 consultando…" (ou presença "digitando"). |
| Custo | Vai **só para o log** do backend — não é enviado ao usuário no WhatsApp. |
| Docker | `docker-compose.yml` sobe **só** Evolution + Postgres. O backend não é dockerizado. |

## Componentes novos

### `docker-compose.yml` (raiz)
Serviços `evolution-api` + `postgres`. Variáveis: `AUTHENTICATION_API_KEY` (=`EVOLUTION_API_KEY`),
conexão Postgres, e webhook global apontando para `http://host.docker.internal:3000/api/whatsapp/webhook`
com evento `MESSAGES_UPSERT` habilitado. Volume para persistir a sessão do WhatsApp (evitar reparear).

### `src/whatsapp/evolutionClient.ts`
Cliente HTTP para a Evolution API:
- `sendText(numero, texto)` → `POST /message/sendText/{instance}` com header `apikey`.
- `sendPresence(numero, "composing")` (opcional, para "digitando").
- Depende de: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`.

### `src/whatsapp/sessions.ts`
Store em memória: `Map<numero, { autenticado: boolean; mensagens: Mensagem[]; expiraEm: number }>`.
- `obter(numero)` — retorna a sessão viva ou uma nova (expira as vencidas).
- `tocar(numero)` — renova `expiraEm` (agora + timeout).
- `limpar(numero)` — remove a sessão (para comando de reset).
- Timeout configurável por `WHATSAPP_SESSION_TIMEOUT_MIN` (padrão 30).

### `src/whatsapp/auth.ts`
Lógica de autenticação por senha:
- Dado (sessão, texto), decide: já autenticado? senha correta? → resultado
  (`autenticar` | `pedir_senha` | `seguir`).
- Compara contra `WHATSAPP_ACCESS_PASSWORD`.

### `src/whatsapp/webhook.ts`
Rota `POST /api/whatsapp/webhook` (factory que recebe deps: `runAgent`, `evolutionClient`,
`sessions`, config). Fluxo:
1. Extrai `numero` + `texto` do payload `messages.upsert` da Evolution. Ignora mensagens
   próprias (`fromMe`), sem texto, ou de grupos.
2. **Responde 200 imediatamente** (Evolution não re-tenta em loop); processa em seguida.
3. Sessão não autenticada → `auth`: se senha correta, autentica + "✅ liberado, pode perguntar";
   senão "🔒 envie a senha de acesso".
4. Comando `sair`/`recomeçar` → `sessions.limpar` + confirma.
5. Autenticado → append no histórico, `sendPresence("composing")` + ack "🔎 consultando…",
   `runAgent({ mensagens })`, `sendText(resposta)`, append da resposta ao histórico, `tocar`.
6. Erro no agente → "⚠️ tive um problema, tenta de novo" + `console.error`.

### Fio em `bootstrap.ts` / `server.ts`
`criarApp` passa a aceitar (opcionalmente) as deps do WhatsApp e registra a rota. O `bootstrap`
instancia `evolutionClient` + `sessions` e reusa o mesmo `runAgent` já criado para o web.
Se as envs do WhatsApp não estiverem setadas, o canal fica **desligado** (backend sobe normal).

## Config nova (.env)

| Variável | O que é | Padrão |
|---|---|---|
| `EVOLUTION_API_URL` | URL da Evolution (local). | `http://localhost:8080` |
| `EVOLUTION_API_KEY` | API key global da Evolution (mesma do compose). | — |
| `EVOLUTION_INSTANCE` | Nome da instância WhatsApp na Evolution. | `canastra` |
| `WHATSAPP_ACCESS_PASSWORD` | Senha exigida na 1ª mensagem. | — |
| `WHATSAPP_SESSION_TIMEOUT_MIN` | Minutos de inatividade até expirar a sessão. | `30` |

Atualizar `.env.example` e o README (seção de setup do WhatsApp).

## Fluxo detalhado de uma mensagem

1. Número manda texto → Evolution → `POST /api/whatsapp/webhook`.
2. Backend responde 200 na hora; extrai `numero`+`texto`.
3. Sessão não autenticada?
   - texto == senha → autentica, responde "✅ liberado".
   - senão → "🔒 envie a senha de acesso". (Não chega ao agente.)
4. `sair`/`recomeçar` → limpa sessão, responde confirmação.
5. Autenticado → ack "🔎 consultando…" → `runAgent` → `sendText(resposta)`.
6. Inatividade > timeout → sessão expira; re-autentica na próxima mensagem.

## Tratamento de erros

- Webhook sempre retorna **200 rápido** (evita re-tentativa em loop da Evolution).
- Payload malformado / sem texto / de grupo / `fromMe` → ignora silenciosamente.
- Falha no `runAgent` → mensagem amigável ao usuário + `console.error` com o stack.
- Falha no `sendText` → log; não derruba o processo.

## Testes (Vitest)

- `auth`: senha correta autentica; senha errada pede senha; já autenticado segue.
- `sessions`: expira após timeout; `limpar` remove; histórico acumula.
- `webhook`: parse do payload real da Evolution (numero/texto, ignora grupo/fromMe/sem-texto);
  número autenticado chama `runAgent` (mockado) e responde via `evolutionClient` (mockado);
  comando `sair` limpa a sessão.
- Sem tocar na Evolution real nem no Bling real (tudo mockado).

## Fora do escopo

- Áudio, imagem, documentos (só **texto**).
- Múltiplas instâncias / múltiplos números.
- Envio proativo ou agendado (ex.: relatório diário automático).
- Persistência de histórico (banco).
- ngrok / exposição pública para o WhatsApp.
- Escrita no Bling (o agente segue **somente leitura**).

## Critérios de sucesso

1. `docker compose up` sobe Evolution + Postgres; pareia o WhatsApp via QR no manager.
2. Um número **não** autorizado recebe pedido de senha e nada mais.
3. Após enviar a senha correta, o número pergunta "quanto vendi hoje?" e recebe a resposta
   com dados reais do Bling — igual ao chat web.
4. Perguntas de acompanhamento ("e no mês passado?") funcionam dentro do timeout.
5. Backend sobe normalmente mesmo sem as envs do WhatsApp (canal desligado).
6. `npm test` passa incluindo os novos testes.
