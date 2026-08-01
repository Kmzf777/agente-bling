# Exportador de Leads Bling → XLSX (padrão Meta)

Data: 2026-07-28

## Objetivo

Gerar uma planilha `.xlsx` com todos os contatos do Bling que tenham telefone
ou celular, com o número normalizado no padrão Meta (só dígitos, com código do
país `55`), pronta para importar em campanhas / disparadores.

## Decisões (definidas com o usuário)

- **O que é "lead":** contatos de `/contatos` que tenham `telefone` OU `celular`
  preenchido. (Bling não tem objeto "lead" nativo.)
- **Formato:** XLSX (via `exceljs`).
- **Formato do telefone:** só dígitos com `55` (ex.: `5542998476388`).
- **Duas abas:** `Validos` e `Invalidos`.

## Arquitetura

### `src/util/telefoneMeta.ts` (puro, testável)

`normalizaTelefoneMeta(raw: string): { numero: string; valido: boolean; tipo: "movel" | "fixo" | "desconhecido" }`

Regras:
1. Remove tudo que não é dígito.
2. Já começa com `55` e tem 12–13 dígitos → mantém como está.
3. Tem 10 dígitos (DDD + fixo 8) ou 11 (DDD + celular 9) → prefixa `55`.
4. Qualquer outro caso (vazio, sem DDD, curto/longo demais) → `valido: false`.
5. `tipo`: 11 díg locais / final móvel → `movel`; 10 díg → `fixo`; senão `desconhecido`.

### `src/scripts/exportarLeads.ts` (entrada standalone)

- Carrega config + `TokenManager` (`.bling-tokens.json`) + `BlingClient`.
- Chama `listarContatos` com teto de páginas alto (não truncar).
- Para cada contato com telefone/celular: prefere `celular`, senão `telefone`.
- Normaliza; separa em válidos e inválidos.
- Dedupe nos válidos por `numero`.
- Escreve `exports/leads-bling-AAAA-MM-DD.xlsx` com abas `Validos`/`Invalidos`.

Colunas: `id | nome | documento | telefone_original | celular_original | telefone_meta | tipo`
(na aba Inválidos, `telefone_meta` mostra os dígitos capturados, se houver).

### `package.json`

- Nova dependência `exceljs`.
- Script `"leads:export": "tsx src/scripts/exportarLeads.ts"`.

## Testes (TDD)

`tests/telefoneMeta.test.ts`: com/sem `55`, com máscara `(42) 99847-6388`,
fixo 10 díg, celular 11 díg, sem DDD, vazio, lixo.

## Fora de escopo

- Não altera o agente nem endpoints existentes.
- Não busca detalhe por contato (a listagem já traz telefone/celular).
