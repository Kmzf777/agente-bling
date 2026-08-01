import type { RequestHandler } from "express";
import type { Mensagem } from "../agent/agentLoop";
import type { SessionStore } from "./sessions";
import { decidirAuth } from "./auth";

// ── Parser do payload de update do Telegram ──────────────────────────────────

export interface MensagemRecebida {
  chatId: string;
  texto: string;
}

/**
 * Extrai chatId + texto do payload de update do Telegram Bot API.
 * Retorna null para updates sem mensagem de texto (sticker, foto, etc.) ou malformados.
 */
export function parseMensagem(body: any): MensagemRecebida | null {
  const msg = body?.message;
  if (!msg) return null;
  const chatId = msg.chat?.id;
  const texto: string | undefined = msg.text;
  if (!chatId || !texto || typeof texto !== "string") return null;
  return { chatId: String(chatId), texto };
}

// ── Cliente mínimo do Telegram Bot API ───────────────────────────────────────

export interface TelegramClient {
  sendMessage(chatId: string, texto: string): Promise<void>;
}

/**
 * Cliente mínimo do Telegram Bot API. Só envia texto — é o único verbo que o canal usa.
 * `fetchImpl` é injetável para testes. Falhas são logadas, não propagadas.
 */
export function criarTelegramClient(
  botToken: string,
  fetchImpl: typeof fetch = fetch,
): TelegramClient {
  return {
    async sendMessage(chatId, texto) {
      try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const r = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: texto }),
        });
        if (!r.ok) console.error(`[telegram] sendMessage ${r.status}: ${await r.text()}`);
      } catch (e) {
        console.error("[telegram] sendMessage falhou:", e);
      }
    },
  };
}

// ── Handler do webhook (orquestração) ────────────────────────────────────────

export interface WebhookDeps {
  runAgent: (args: { mensagens: Mensagem[] }) => Promise<{ texto: string }>;
  telegram: TelegramClient;
  sessions: SessionStore;
  senha: string;
}

const RESET = new Set(["sair", "recomeçar", "recomecar", "reset"]);

/**
 * Handler do webhook do Telegram. Responde 200 na hora (evita re-tentativa do Telegram) e
 * processa a mensagem em background: autenticação por senha → agente → resposta via sendMessage.
 *
 * Design assíncrono: o handler dispara `processar()` como Promise não-aguardada e responde
 * 200 imediatamente. Os testes adicionam `await new Promise(r => setImmediate(r))` após o
 * request para drenar a microtask/macrotask queue — garantindo que o processamento async
 * (mocks de resolução imediata) terminou antes das asserções, sem bloquear a resposta 200
 * em produção.
 */
export function criarWebhookTelegram(deps: WebhookDeps): RequestHandler {
  return (req, res) => {
    res.sendStatus(200);
    const msg = parseMensagem(req.body);
    if (!msg) return;
    // Disparo em background: não bloqueia a resposta 200
    processar(deps, msg).catch((e) => console.error("[telegram] erro no processamento:", e));
  };
}

async function processar(deps: WebhookDeps, { chatId, texto }: MensagemRecebida): Promise<void> {
  const { sessions, telegram } = deps;

  // Comandos de reset encerram a sessão independentemente de autenticação
  if (RESET.has(texto.trim().toLowerCase())) {
    sessions.limpar(chatId);
    await telegram.sendMessage(chatId, "🔄 Sessão reiniciada. Envie a senha de acesso para começar de novo.");
    return;
  }

  const sessao = sessions.obter(chatId);
  const decisao = decidirAuth(sessao, texto, deps.senha);

  if (decisao === "pedir_senha") {
    await telegram.sendMessage(chatId, "🔒 Envie a senha de acesso para usar o assistente.");
    return;
  }

  if (decisao === "autenticar") {
    sessao.autenticado = true;
    sessions.tocar(chatId);
    await telegram.sendMessage(chatId, "✅ Acesso liberado! Pode perguntar (ex.: \"quanto vendi hoje?\").");
    return;
  }

  // decisao === "seguir": usuário autenticado → chama o agente
  sessao.mensagens.push({ role: "user", content: texto });
  await telegram.sendMessage(chatId, "🔎 Consultando…");
  try {
    const { texto: resposta } = await deps.runAgent({ mensagens: sessao.mensagens });
    // Fallback defensivo: nunca enviar mensagem vazia (o Telegram ignora e
    // o usuário ficaria sem retorno). O runAgent real já garante texto, mas o tipo não.
    const textoFinal = resposta?.trim() || "Não consegui gerar uma resposta agora. Tente reformular a pergunta.";
    sessao.mensagens.push({ role: "assistant", content: textoFinal });
    sessions.tocar(chatId);
    await telegram.sendMessage(chatId, textoFinal);
  } catch (e) {
    console.error("[telegram] runAgent falhou:", e);
    await telegram.sendMessage(chatId, "⚠️ Tive um problema para consultar agora. Tente de novo em instantes.");
  }
}
