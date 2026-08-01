// Serializa dados em CSV (RFC 4180): campos com vírgula, aspas ou quebra de
// linha são envolvidos em aspas, e aspas internas são duplicadas. Linhas em CRLF.
function escapa(valor: unknown): string {
  const s = valor === null || valor === undefined ? "" : String(valor);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function paraCsv(headers: string[], linhas: unknown[][]): string {
  const linhaCsv = (campos: unknown[]) => campos.map(escapa).join(",");
  return [linhaCsv(headers), ...linhas.map(linhaCsv)].join("\r\n");
}
