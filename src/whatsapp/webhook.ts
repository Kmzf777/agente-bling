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
