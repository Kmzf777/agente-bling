export type TipoTelefone = "movel" | "fixo" | "desconhecido";
export interface TelefoneMeta { numero: string; valido: boolean; tipo: TipoTelefone; }

// Normaliza um telefone para o padrão Meta: só dígitos, com código do país 55
// (ex.: "(42) 99847-6388" -> "5542998476388"). Números sem DDD ou fora do
// tamanho esperado são marcados como inválidos, preservando os dígitos capturados.
export function normalizaTelefoneMeta(raw: string): TelefoneMeta {
  const digitos = (raw || "").replace(/\D/g, "");
  if (!digitos) return { numero: "", valido: false, tipo: "desconhecido" };

  // Se já vem com 55 + (10 ou 11) dígitos locais, separa o código do país.
  const local = (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13))
    ? digitos.slice(2)
    : digitos;

  if (local.length === 11) return { numero: "55" + local, valido: true, tipo: "movel" };
  if (local.length === 10) return { numero: "55" + local, valido: true, tipo: "fixo" };
  return { numero: digitos, valido: false, tipo: "desconhecido" };
}
