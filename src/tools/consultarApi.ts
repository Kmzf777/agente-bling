import type { BlingClient } from "../bling/blingClient";
import { validarPathLeitura } from "../bling/readOnlyGuard";

export interface ConsultarApiDeps { client: BlingClient; }
export interface ConsultarApiArgs {
  path: string;
  params?: Record<string, string | number | Array<string | number>>;
  todasPaginas?: boolean;
  maxPaginas?: number;
}

/**
 * Escape hatch: deixa o agente consultar QUALQUER endpoint de LEITURA da API v3 do Bling
 * que as tools típadas não cobrem. Guardado pelo read-only whitelist (validarPathLeitura).
 */
export async function consultarApi(deps: ConsultarApiDeps, args: ConsultarApiArgs) {
  if (!validarPathLeitura(args.path)) {
    throw new Error(`Path não permitido (somente leitura): ${args.path}`);
  }
  if (args.todasPaginas) {
    const { itens, truncado } = await deps.client.getAllPages<any>(args.path, args.params ?? {}, { maxPaginas: args.maxPaginas ?? 20 });
    return { dados: itens, paginacao: { truncado } };
  }
  const resp = await deps.client.get<any>(args.path, args.params ?? {});
  return { dados: resp?.data ?? resp };
}
