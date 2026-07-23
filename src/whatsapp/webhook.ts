import type { RequestHandler } from "express";
import type { Mensagem } from "../agent/agentLoop";
import type { SessionStore } from "./sessions";
import { decidirAuth } from "./auth";

// ── Task 4: Parser do payload messages.upsert da Evolution ────────────────

export interface MensagemRecebida {
  numero: string;
  texto: string;
}

/**
 * Extrai numero + texto do payload `messages.upsert` da Evolution.
 * Retorna null para: próprias (fromMe), grupos (@g.us), sem texto, ou malformadas.
 */
export function parseMensagem(body: any): MensagemRecebida | null {
  const data = body?.data;
  const key = data?.key;
  if (!key || key.fromMe) return null;
  const jid: string = key.remoteJid ?? "";
  if (!jid || jid.endsWith("@g.us")) return null;
  const numero = jid.split("@")[0];
  const msg = data.message ?? {};
  const texto: string | undefined = msg.conversation ?? msg.extendedTextMessage?.text;
  if (!numero || !texto || typeof texto !== "string") return null;
  return { numero, texto };
}

// ── Task 5: Handler do webhook (orquestração) ────────────────────────────

export interface WebhookDeps {
  runAgent: (args: { mensagens: Mensagem[] }) => Promise<{ texto: string }>;
  evolution: { sendText: (numero: string, texto: string) => Promise<void> };
  sessions: SessionStore;
  senha: string;
}

const RESET = new Set(["sair", "recomeçar", "recomecar", "reset"]);

/**
 * Handler do webhook da Evolution. Responde 200 na hora (evita re-tentativa em loop) e
 * processa a mensagem em background: autenticação por senha → agente → resposta via sendText.
 *
 * Design assíncrono: o handler dispara `processar()` como Promise não-aguardada e responde
 * 200 imediatamente. Os testes adicionam `await new Promise(r => setImmediate(r))` após o
 * request para drenar a microtask/macrotask queue — garantindo que o processamento async
 * (mocks de resolução imediata) terminou antes das asserções, sem bloquear a resposta 200
 * em produção.
 */
export function criarWebhookWhatsApp(deps: WebhookDeps): RequestHandler {
  return (req, res) => {
    res.sendStatus(200);
    const msg = parseMensagem(req.body);
    if (!msg) return;
    // Disparo em background: não bloqueia a resposta 200
    processar(deps, msg).catch((e) => console.error("[whatsapp] erro no processamento:", e));
  };
}

async function processar(deps: WebhookDeps, { numero, texto }: MensagemRecebida): Promise<void> {
  const { sessions, evolution } = deps;

  // Comandos de reset encerram a sessão independentemente de autenticação
  if (RESET.has(texto.trim().toLowerCase())) {
    sessions.limpar(numero);
    await evolution.sendText(numero, "🔄 Sessão reiniciada. Envie a senha de acesso para começar de novo.");
    return;
  }

  const sessao = sessions.obter(numero);
  const decisao = decidirAuth(sessao, texto, deps.senha);

  if (decisao === "pedir_senha") {
    await evolution.sendText(numero, "🔒 Envie a senha de acesso para usar o assistente.");
    return;
  }

  if (decisao === "autenticar") {
    sessao.autenticado = true;
    sessions.tocar(numero);
    await evolution.sendText(numero, "✅ Acesso liberado! Pode perguntar (ex.: \"quanto vendi hoje?\").");
    return;
  }

  // decisao === "seguir": usuário autenticado → chama o agente
  sessao.mensagens.push({ role: "user", content: texto });
  await evolution.sendText(numero, "🔎 Consultando…");
  try {
    const { texto } = await deps.runAgent({ mensagens: sessao.mensagens });
    // Fallback defensivo: nunca enviar mensagem vazia (o WhatsApp/Evolution rejeita e
    // o usuário ficaria sem retorno). O runAgent real já garante texto, mas o tipo não.
    const resposta = texto?.trim() || "Não consegui gerar uma resposta agora. Tente reformular a pergunta.";
    sessao.mensagens.push({ role: "assistant", content: resposta });
    sessions.tocar(numero);
    await evolution.sendText(numero, resposta);
  } catch (e) {
    console.error("[whatsapp] runAgent falhou:", e);
    await evolution.sendText(numero, "⚠️ Tive um problema para consultar agora. Tente de novo em instantes.");
  }
}
