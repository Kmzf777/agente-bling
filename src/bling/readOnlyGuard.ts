// Prefixos de recursos de LEITURA permitidos na API v3 do Bling.
// O agente é read-only: a tool genérica (bling_consultar_api) só pode tocar estes recursos.
// O BlingClient já não expõe métodos de escrita — isto é a segunda camada (defense-in-depth).
const PREFIXOS_LEITURA = [
  "/pedidos/vendas",
  "/produtos",
  "/estoques",
  "/ordens-producao",
  "/contatos",
  "/contas/pagar",
  "/contas/receber",
  "/nfe",
  "/categorias",
  "/situacoes",
  "/formas-pagamentos",
  "/depositos",
];

export function validarPathLeitura(path: string): boolean {
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("..")) return false;
  const limpo = path.split("?")[0];
  return PREFIXOS_LEITURA.some((p) => limpo === p || limpo.startsWith(p + "/"));
}
