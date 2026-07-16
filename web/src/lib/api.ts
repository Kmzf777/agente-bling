/**
 * Cliente de API do agente Bling.
 *
 * O frontend pode estar hospedado em outra origem (ex.: Vercel) e o backend
 * exposto via ngrok/local. Por isso a autenticação é por **token Bearer**
 * (guardado no navegador) e a base da API vem de `VITE_API_BASE`. O header
 * `ngrok-skip-browser-warning` evita a página de aviso do ngrok em requisições.
 */

const env = import.meta.env as unknown as Record<string, string | undefined>;
const API_BASE = (env.VITE_API_BASE ?? "").replace(/\/$/, "");
const TOKEN_KEY = "canastra_token";

export type Mensagem = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Lançada quando o backend responde 401 em `/api/chat` (sessão inválida/expirada).
 * O app usa este tipo para redirecionar de volta ao login sem perder a conversa.
 */
export class NaoAutenticado extends Error {
  constructor(mensagem = "Sessão não autenticada.") {
    super(mensagem);
    this.name = "NaoAutenticado";
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function estaAutenticado(): boolean {
  return !!getToken();
}

function montarHeaders(comAuth = true): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  };
  const token = getToken();
  if (comAuth && token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

/**
 * Autentica com a senha do painel. Em caso de sucesso, guarda o token no navegador.
 * @returns `true` se a senha for aceita (200), `false` se inválida (401).
 * @throws Error para falhas de rede ou respostas inesperadas.
 */
export async function login(senha: string): Promise<boolean> {
  const resp = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: montarHeaders(false),
    body: JSON.stringify({ senha }),
  });

  if (resp.status === 200) {
    const dados = (await resp.json()) as { token?: string };
    if (dados.token) localStorage.setItem(TOKEN_KEY, dados.token);
    return true;
  }
  if (resp.status === 401) return false;

  throw new Error(`Falha ao entrar (HTTP ${resp.status}).`);
}

/** Encerra a sessão local (remove o token do navegador). */
export async function logout(): Promise<void> {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Envia o histórico completo da conversa e devolve o texto da resposta.
 *
 * @throws {NaoAutenticado} quando a sessão não está autenticada (401).
 * @throws {Error} para erros de servidor (500) ou de rede.
 */
export async function enviarChat(mensagens: Mensagem[]): Promise<string> {
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: montarHeaders(),
      body: JSON.stringify({ mensagens }),
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor. Verifique sua conexão.");
  }

  if (resp.status === 401) {
    throw new NaoAutenticado();
  }

  if (!resp.ok) {
    const erro = await lerErro(resp);
    throw new Error(erro ?? `Erro no servidor (HTTP ${resp.status}).`);
  }

  const dados = (await resp.json()) as { texto?: string };
  return dados.texto ?? "";
}

/** Eventos emitidos pelo backend no stream SSE (/api/chat/stream). */
export type EventoChat =
  | { tipo: "tool_inicio"; id: string; nome: string; args?: Record<string, unknown> }
  | { tipo: "tool_fim"; id: string; resumo: string }
  | { tipo: "texto"; delta: string }
  | { tipo: "fim"; texto: string }
  | { tipo: "erro"; erro: string };

export type CallbacksStream = {
  onToolInicio?: (p: { id: string; nome: string; args?: Record<string, unknown> }) => void;
  onToolFim?: (p: { id: string; resumo: string }) => void;
  onDelta?: (delta: string) => void;
  onFim?: (textoFinal: string) => void;
};

/**
 * Envia a conversa e consome a resposta em STREAM (SSE): dispara `onToolInicio`
 * quando o agente começa uma ferramenta, `onToolFim` com o resumo do resultado,
 * `onDelta` a cada pedaço de texto, e `onFim` com o texto final.
 *
 * @throws {NaoAutenticado} em 401. @throws {Error} para falhas de servidor/rede.
 */
export async function enviarChatStream(mensagens: Mensagem[], cbs: CallbacksStream): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}/api/chat/stream`, {
      method: "POST",
      headers: montarHeaders(),
      body: JSON.stringify({ mensagens }),
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor. Verifique sua conexão.");
  }

  if (resp.status === 401) throw new NaoAutenticado();
  if (!resp.ok || !resp.body) {
    const erro = await lerErro(resp);
    throw new Error(erro ?? `Erro no servidor (HTTP ${resp.status}).`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let textoFinal = "";
  let fimVisto = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const bloco = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const payload = bloco.replace(/^data:\s?/, "").trim();
      if (!payload) continue;

      let ev: EventoChat;
      try {
        ev = JSON.parse(payload) as EventoChat;
      } catch {
        continue;
      }

      if (ev.tipo === "tool_inicio") {
        cbs.onToolInicio?.({ id: ev.id, nome: ev.nome, args: ev.args });
      } else if (ev.tipo === "tool_fim") {
        cbs.onToolFim?.({ id: ev.id, resumo: ev.resumo });
      } else if (ev.tipo === "texto") {
        textoFinal += ev.delta;
        cbs.onDelta?.(ev.delta);
      } else if (ev.tipo === "fim") {
        fimVisto = true;
        textoFinal = ev.texto || textoFinal;
        cbs.onFim?.(textoFinal);
      } else if (ev.tipo === "erro") {
        throw new Error((ev as { tipo: "erro"; erro: string }).erro || "Falha ao processar a mensagem.");
      }
    }
  }

  if (!fimVisto) cbs.onFim?.(textoFinal);
}

/** Extrai `{ erro }` do corpo de uma resposta de falha, se houver. */
async function lerErro(resp: Response): Promise<string | null> {
  try {
    const dados = (await resp.json()) as { erro?: string };
    return typeof dados.erro === "string" ? dados.erro : null;
  } catch {
    return null;
  }
}
