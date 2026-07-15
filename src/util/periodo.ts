export type Periodo =
  | "hoje" | "ontem" | "esta_semana" | "semana_passada"
  | "este_mes" | "mes_passado" | "personalizado";

export interface IntervaloDatas { dataInicial: string; dataFinal: string; }

// Representa "agora" em SP como um UTC deslocado, e opera só com a parte de data.
function partesSP(d: Date) {
  const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000); // -03:00
  return { y: sp.getUTCFullYear(), m: sp.getUTCMonth(), d: sp.getUTCDate() };
}
function ymd(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m, d));
  return dt.toISOString().slice(0, 10);
}
// 0=segunda ... 6=domingo
function diaSemanaSegunda(y: number, m: number, d: number): number {
  return (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7;
}

export function resolverPeriodo(
  periodo: Periodo, hoje: Date = new Date(), dataInicial?: string, dataFinal?: string,
): IntervaloDatas {
  if (periodo === "personalizado") {
    if (!dataInicial || !dataFinal) throw new Error("período personalizado exige dataInicial e dataFinal");
    return { dataInicial, dataFinal };
  }
  const { y, m, d } = partesSP(hoje);
  const hojeStr = ymd(y, m, d);
  switch (periodo) {
    case "hoje": return { dataInicial: hojeStr, dataFinal: hojeStr };
    case "ontem": { const o = ymd(y, m, d - 1); return { dataInicial: o, dataFinal: o }; }
    case "esta_semana": {
      const off = diaSemanaSegunda(y, m, d);
      return { dataInicial: ymd(y, m, d - off), dataFinal: hojeStr };
    }
    case "semana_passada": {
      const off = diaSemanaSegunda(y, m, d);
      return { dataInicial: ymd(y, m, d - off - 7), dataFinal: ymd(y, m, d - off - 1) };
    }
    case "este_mes": return { dataInicial: ymd(y, m, 1), dataFinal: hojeStr };
    case "mes_passado": return { dataInicial: ymd(y, m - 1, 1), dataFinal: ymd(y, m, 0) };
    default: throw new Error(`período inválido: ${String(periodo)}`);
  }
}
