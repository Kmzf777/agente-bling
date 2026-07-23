export type DecisaoAuth = "seguir" | "autenticar" | "pedir_senha";

/**
 * Decide o que fazer com uma mensagem, dado o estado de autenticação da sessão.
 * Senha na 1ª mensagem: enquanto não autenticado, só a senha correta libera.
 */
export function decidirAuth(
  sessao: { autenticado: boolean },
  texto: string,
  senha: string,
): DecisaoAuth {
  if (sessao.autenticado) return "seguir";
  if (texto.trim() === senha) return "autenticar";
  return "pedir_senha";
}
