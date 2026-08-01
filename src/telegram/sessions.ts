import type { Mensagem } from "../agent/agentLoop";

export interface Sessao {
  autenticado: boolean;
  mensagens: Mensagem[];
  expiraEm: number; // epoch ms
}

export interface SessionStore {
  /** Retorna a sessão viva do chatId, ou cria uma nova (resetando se expirou). */
  obter(chatId: string): Sessao;
  /** Renova a expiração do chatId (agora + timeout). */
  tocar(chatId: string): void;
  /** Remove a sessão (comando de reset). */
  limpar(chatId: string): void;
}

/**
 * Store em memória por chatId do Telegram. Coerente com a filosofia "sem banco": o histórico
 * vive na RAM do backend e some ao reiniciar. Sessões inativas expiram após `timeoutMin`.
 * `agora` é injetável para os testes.
 */
export function criarSessions(timeoutMin: number, agora: () => number = Date.now): SessionStore {
  const mapa = new Map<string, Sessao>();
  const ttl = timeoutMin * 60 * 1000;
  const nova = (): Sessao => ({ autenticado: false, mensagens: [], expiraEm: agora() + ttl });
  return {
    obter(chatId) {
      const s = mapa.get(chatId);
      if (!s || agora() > s.expiraEm) {
        const n = nova();
        mapa.set(chatId, n);
        return n;
      }
      return s;
    },
    tocar(chatId) {
      const s = mapa.get(chatId);
      if (s) s.expiraEm = agora() + ttl;
    },
    limpar(chatId) {
      mapa.delete(chatId);
    },
  };
}
