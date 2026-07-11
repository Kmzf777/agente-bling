# Agente Bling Café ☕

Assistente de IA em formato de **chat web** para uma empresa de café. Você pergunta em
linguagem natural sobre **vendas, faturamento, estoque e produção** e o agente responde com
dados **ao vivo** do ERP **Bling** (API v3), incluindo um **relatório diário sob demanda**.

- **Backend:** Node + TypeScript (Express) rodando um agente Claude com *tool use*.
- **Frontend:** React + Vite + Tailwind + shadcn/ui.
- **Somente leitura:** o agente nunca escreve/altera nada no Bling.
- **Sem banco de dados:** o histórico da conversa vive no navegador; os tokens do Bling ficam em `.bling-tokens.json`.

> Documentos de projeto: [`docs/superpowers/specs/2026-07-11-agente-bling-cafe-design.md`](docs/superpowers/specs/2026-07-11-agente-bling-cafe-design.md) (spec) e [`docs/superpowers/plans/2026-07-11-agente-bling-cafe.md`](docs/superpowers/plans/2026-07-11-agente-bling-cafe.md) (plano).

## Pré-requisitos
- **Node.js ≥ 20**.
- Uma conta **Bling** com um **aplicativo** criado no [portal de desenvolvedor](https://developer.bling.com.br/) (você já tem o **Client ID** e **Client Secret** da API v3).
- Uma **chave de API da Anthropic** (`ANTHROPIC_API_KEY`).

## Configuração (passo a passo)

1. **Variáveis de ambiente** — copie o exemplo e preencha:
   ```powershell
   Copy-Item .env.example .env
   ```
   | Variável | O que é |
   |---|---|
   | `ANTHROPIC_API_KEY` | Sua chave da Anthropic. |
   | `ANTHROPIC_MODEL` | Modelo. Padrão `claude-haiku-4-5` (barato/rápido). Suba para `claude-sonnet-4-6` se quiser mais raciocínio. |
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

## O que dá para perguntar
- "Quanto vendi hoje / essa semana / esse mês?" · "Qual meu ticket médio?"
- "Qual o faturamento do mês? E comparado ao mês passado?"
- "O que está abaixo do estoque mínimo?" · "Quanto tenho do café X?"
- "O que produzi essa semana?" · "Ordens de produção abertas?"
- **"Gere o relatório de hoje"** (botão dedicado no chat).

## Testes
```powershell
npm test            # suíte do backend (vitest)
```

## Segurança e produção
- **Nunca** versione `.env` nem `.bling-tokens.json` (já estão no `.gitignore`).
- O agente é **somente leitura**: não há nenhum caminho de código que escreva no Bling.
- Para expor na internet (HTTPS): habilite o flag `secure: true` no cookie de sessão
  (em `src/server.ts`) e coloque atrás de um proxy reverso com TLS. Em `localhost`/HTTP, o
  `secure` fica desligado de propósito (senão o login não funcionaria).

## Fora do escopo do MVP
WhatsApp · banco de dados · histórico persistente · relatório automático agendado/por e-mail ·
NF-e · Financeiro (contas a pagar/receber) · múltiplos usuários com permissões.

## Smoke test manual (fazer com credenciais reais)
Após preencher `.env` e rodar `npm run bling:auth`, valide de ponta a ponta:
1. `npm start`, logue no site.
2. Pergunte "quanto vendi hoje?", "o que está abaixo do mínimo no estoque?", "gere o relatório de hoje".
3. Confira se os números batem com o que você vê no Bling.

> Este passo depende das suas credenciais reais do Bling/Anthropic e por isso **não** é executado
> automaticamente pela suíte de testes.

### Pontos a validar contra a API real do Bling
Alguns detalhes da API v3 só se confirmam com dados reais. Se alguma consulta vier vazia ou errada, verifique:
- **Estoque:** o recurso `GET /estoques/saldos` pode exigir `idsProdutos[]` na sua conta. Se `consultar_estoque` vier vazio, é o primeiro suspeito (ver `src/bling/endpoints.ts`).
- **Produção:** os campos de `GET /ordens-producao` (`situacao`, `quantidade`) podem ter nomes/formatos diferentes; ajuste `src/tools/consultarProducao.ts` conforme a resposta real.
- **Faturamento:** confirme os IDs em `BLING_SITUACAO_FATURADO_IDS` (o filtro já é enviado como chaves repetidas `idsSituacoes[]=…`).
- **Datas:** confirme se `dataFinal` é inclusivo nos pedidos de venda.
