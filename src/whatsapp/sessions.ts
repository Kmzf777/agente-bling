import type { Mensagem } from "../agent/agentLoop";

export interface Sessao {
  autenticado: boolean;
  mensagens: Mensagem[];
  expiraEm: number; // epoch ms
}

export interface SessionStore {
  /** Retorna a sessão viva do número, ou cria uma nova (resetando se expirou). */
  obter(numero: string): Sessao;
  /** Renova a expiração do número (agora + timeout). */
  tocar(numero: string): void;
  /** Remove a sessão (comando de reset). */
  limpar(numero: string): void;
}

/**
 * Store em memória por número. Coerente com a filosofia "sem banco": o histórico
 * vive na RAM do backend e some ao reiniciar. Sessões inativas expiram após `timeoutMin`.
 * `agora` é injetável para os testes.
 */
export function criarSessions(timeoutMin: number, agora: () => number = Date.now): SessionStore {
  const mapa = new Map<string, Sessao>();
  const ttl = timeoutMin * 60 * 1000;
  const nova = (): Sessao => ({ autenticado: false, mensagens: [], expiraEm: agora() + ttl });
  return {
    obter(numero) {
      const s = mapa.get(numero);
      if (!s || agora() > s.expiraEm) {
        const n = nova();
        mapa.set(numero, n);
        return n;
      }
      return s;
    },
    tocar(numero) {
      const s = mapa.get(numero);
      if (s) s.expiraEm = agora() + ttl;
    },
    limpar(numero) {
      mapa.delete(numero);
    },
  };
}
