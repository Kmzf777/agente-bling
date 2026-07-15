# Agente Bling Café ☕

Assistente de IA em formato de **chat web** para uma empresa de café. Você pergunta em
linguagem natural sobre **vendas, faturamento, estoque e produção** e o agente responde com
dados **ao vivo** do ERP **Bling** (API v3), incluindo um **relatório diário sob demanda**.

- **Backend:** Node + TypeScript (Express) rodando um **agente autônomo** (Claude/Anthropic via Vercel AI SDK) com loop multi-step e *streaming*.
- **Frontend:** React + Vite + Tailwind + shadcn/ui.
- **Somente leitura:** o agente nunca escreve/altera nada no Bling.
- **Sem banco de dados:** o histórico da conversa vive no navegador; os tokens do Bling ficam em `.bling-tokens.json`.

> Documentos de projeto: [`docs/superpowers/specs/2026-07-11-agente-bling-cafe-design.md`](docs/superpowers/specs/2026-07-11-agente-bling-cafe-design.md) (spec) e [`docs/superpowers/plans/2026-07-11-agente-bling-cafe.md`](docs/superpowers/plans/2026-07-11-agente-bling-cafe.md) (plano).

## Pré-requisitos
- **Node.js ≥ 20**.
- Uma conta **Bling** com um **aplicativo** criado no [portal de desenvolvedor](https://developer.bling.com.br/) (você já tem o **Client ID** e **Client Secret** da API v3).
- Uma **chave de API da Anthropic** (`ANTHROPIC_API_KEY`) — o agente usa Claude por padrão.

## Configuração (passo a passo)

1. **Variáveis de ambiente** — copie o exemplo e preencha:
   ```powershell
   Copy-Item .env.example .env
   ```
   | Variável | O que é |
   |---|---|
   | `ANTHROPIC_API_KEY` | Sua chave da Anthropic (Claude). |
   | `AGENT_MODEL` | Modelo. Padrão `claude-sonnet-4-6` (ótimo custo/qualidade). |
   | `AGENT_PROVIDER` | Provider do agente. Padrão `anthropic`. |
   | `AGENT_MAX_STEPS` | Máx. de passos do loop agêntico (padrão `20`). |
   | `BLING_CLIENT_ID` / `BLING_CLIENT_SECRET` | Credenciais do seu app Bling. |
   | `BLING_REDIRECT_URI` | Padrão `http://localhost:3000/api/bling/callback`. **Deve ser idêntica** à URL de redirecionamento cadastrada no seu app Bling. |
   | `BLING_SITUACAO_FATURADO_IDS` | IDs (separados por vírgula) das situações consideradas "faturado" (ver abaixo). |
   | `APP_PASSWORD` | Senha única de acesso ao site. |
   | `SESSION_SECRET` | Segredo longo e aleatório para assinar o cookie de sessão. |
   | `PORT` | Porta do servidor (padrão `3000`). |

2. **Instale as dependências do backend:**
   ```powershell
   npm install
   ```

3. **Conecte o Bling (uma única vez)** — inicia o fluxo OAuth:
   ```powershell
   npm run bling:auth
   ```
   Abra no navegador a URL impressa no console, autorize o app, e o token será salvo em
   `.bling-tokens.json`. Depois disso o token **se renova sozinho** (o *refresh token* dura ~30 dias;
   se ficar mais que isso sem uso, rode `npm run bling:auth` de novo).

4. **Monte o frontend:**
   ```powershell
   npm --prefix web install
   npm --prefix web run build
   ```

5. **Suba o servidor:**
   ```powershell
   npm start
   ```
   Abra **http://localhost:3000**, faça login com a `APP_PASSWORD` e comece a conversar.

### Como descobrir os `BLING_SITUACAO_FATURADO_IDS`
No Bling, as **situações** de pedido de venda (ex.: *Em aberto*, *Atendido*, *Faturado*) são
**personalizáveis por conta** — por isso os IDs precisam ser configurados. Para descobri-los:
- No painel do Bling, em **Configurações → Situações** (módulo *Pedidos de venda*), veja quais
  situações representam um pedido já faturado; **ou**
- Consulte a API v3 (recurso de situações do módulo de vendas) com o token já obtido.

Coloque os IDs correspondentes em `BLING_SITUACAO_FATURADO_IDS` (ex.: `9,12`). Enquanto estiver
vazio, a consulta de **faturamento** não filtra por situação (tende a retornar 0). As demais
consultas (vendas, estoque, produção) funcionam normalmente sem isso.

> **Nota sobre "faturamento":** para o MVP, faturamento é **aproximado** pela soma dos pedidos de
> venda com situação faturada — **não** pela emissão de NF-e. É uma boa aproximação para gestão;
> dá para refinar depois trazendo NF-e.

## Modo desenvolvimento
Dois terminais:
```powershell
npm run dev                 # backend (tsx watch) em :3000
npm --prefix web run dev    # frontend (Vite) — abre a URL do Vite; /api é proxied para :3000
```

## Deploy: backend local + ngrok + frontend na Vercel
Cenário: o **backend roda na sua máquina**, exposto à internet via **ngrok**, e o **frontend fica na Vercel**. Como ficam em domínios diferentes, a auth é por **token Bearer** (não cookie) e o backend tem **CORS** liberado.

1. **Backend local:** preencha o `.env` (inclusive `OPENAI_API_KEY`), rode `npm run bling:auth` uma vez (com `BLING_REDIRECT_URI=http://localhost:3000/api/bling/callback` registrado no app Bling) e depois `npm start` (porta 3000).
2. **ngrok:** instale (https://ngrok.com/download, ou `choco install ngrok`, ou `npm i -g ngrok`), autentique com `ngrok config add-authtoken <SEU_TOKEN>` e exponha a porta:
   ```powershell
   ngrok http 3000
   # ou, com domínio estático grátis (recomendado — URL fixa):
   ngrok http --url=SEU-SUBDOMINIO.ngrok-free.app 3000
   ```
   Copie a URL `https://...ngrok-free.app`.
3. **Vercel (frontend):** em *Settings → Environment Variables*, defina **`VITE_API_BASE`** com a URL do ngrok e **faça um novo deploy** (o Vite injeta a variável no build). Pronto: o frontend na Vercel passa a falar com seu backend local.

> No plano free a URL do ngrok muda a cada reinício — reivindique o **domínio estático gratuito** para não ter que atualizar `VITE_API_BASE` toda vez.

## O que dá para perguntar
- "Quanto vendi hoje / essa semana / esse mês?" · "Qual meu ticket médio?"
- "Qual o faturamento do mês? E comparado ao mês passado?"
- "O que está abaixo do estoque mínimo?" · "Quanto tenho do café X?"
- "O que produzi essa semana?" · "Ordens de produção abertas?"
- **NF-e/fiscal:** "Os produtos em NF foram CFOP de venda ou bonificação?" · "Quanto emiti em NF-e no mês?"
- **Financeiro:** "Qual o total de contas pagas no mês passado?" (distingue **pago x em aberto**) · "Contas a receber vencendo essa semana?"
- **"Gere o relatório de hoje"** (botão dedicado no chat).

## Testes
```powershell
npm test            # suíte do backend (vitest)
```

## Segurança e produção
- **Nunca** versione `.env` nem `.bling-tokens.json` (já estão no `.gitignore`).
- O agente é **somente leitura**: não há nenhum caminho de código que escreva no Bling.
- **Autenticação por token:** o login devolve um token Bearer (derivado do `SESSION_SECRET`)
  que o frontend guarda e envia no header `Authorization`. Não há cookie de sessão, o que
  simplifica o uso cross-origin (frontend e backend em domínios diferentes).
- **CORS:** liberado por `CORS_ORIGIN` (padrão `*`). Como a auth é por token, `*` é seguro;
  em produção dá para restringir à URL do frontend.

## Fora do escopo
WhatsApp · banco de dados · histórico persistente · relatório automático agendado/por e-mail ·
**escrita no Bling** (o agente é somente-leitura) · múltiplos usuários com permissões · sub-agentes (fase 2).

> **NF-e/fiscal (CFOP, venda vs bonificação)** e **Financeiro (contas a pagar/receber, pago vs em aberto)**
> agora estão **no escopo** — ver a spec do agente autônomo em `docs/superpowers/specs/`.

## Smoke test manual (fazer com credenciais reais)
Após preencher `.env` e rodar `npm run bling:auth`, valide de ponta a ponta:
1. `npm start`, logue no site.
2. Pergunte "quanto vendi hoje?", "o que está abaixo do mínimo no estoque?", "gere o relatório de hoje".
3. Confira se os números batem com o que você vê no Bling.

> Este passo depende das suas credenciais reais do Bling/OpenAI e por isso **não** é executado
> automaticamente pela suíte de testes.

### Pontos a validar contra a API real do Bling
Alguns detalhes da API v3 só se confirmam com dados reais. Se alguma consulta vier vazia ou errada, verifique:
- **Estoque:** o recurso `GET /estoques/saldos` pode exigir `idsProdutos[]` na sua conta. Se `consultar_estoque` vier vazio, é o primeiro suspeito (ver `src/bling/endpoints.ts`).
- **Produção:** os campos de `GET /ordens-producao` (`situacao`, `quantidade`) podem ter nomes/formatos diferentes; ajuste `src/tools/consultarProducao.ts` conforme a resposta real.
- **Faturamento:** confirme os IDs em `BLING_SITUACAO_FATURADO_IDS` (o filtro já é enviado como chaves repetidas `idsSituacoes[]=…`).
- **Datas:** confirme se `dataFinal` é inclusivo nos pedidos de venda.
