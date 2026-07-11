/**
 * Cliente de API do "Canastra" — assistente do café.
 *
 * Todas as chamadas usam `credentials: "include"` para carregar o cookie de
 * sessão emitido pelo backend. Em desenvolvimento, o proxy do Vite encaminha
 * `/api/*` para o servidor Express.
 */

export type Mensagem = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Lançada quando o backend responde 401 em `/api/chat`, indicando que a
 * sessão expirou ou não está autenticada. O app usa este tipo para
 * redirecionar de volta à tela de login sem perder a conversa.
 */
export class NaoAutenticado extends Error {
  constructor(mensagem = "Sessão não autenticada.") {
    super(mensagem);
    this.name = "NaoAutenticado";
  }
}

/**
 * Autentica com a senha do painel.
 * @returns `true` se a senha for aceita (200), `false` se inválida (401).
 * @throws Error para falhas de rede ou respostas inesperadas.
 */
export async function login(senha: string): Promise<boolean> {
  const resp = await fetch("/api/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ senha }),
  });

  if (resp.status === 200) return true;
  if (resp.status === 401) return false;

  throw new Error(`Falha ao entrar (HTTP ${resp.status}).`);
}

/** Encerra a sessão atual. Erros são silenciados — logout é "best effort". */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* Ignorado: sair localmente já basta para a UI. */
  }
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
    resp = await fetch("/api/chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
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

/** Extrai `{ erro }` do corpo de uma resposta de falha, se houver. */
async function lerErro(resp: Response): Promise<string | null> {
  try {
    const dados = (await resp.json()) as { erro?: string };
    return typeof dados.erro === "string" ? dados.erro : null;
  } catch {
    return null;
  }
}
