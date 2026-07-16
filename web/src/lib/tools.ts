/**
 * Mapa de ferramentas do agente: ícone Lucide + rótulo humano.
 * Importado por Chat.tsx e AtividadeCard.tsx.
 */
import {
  type LucideIcon,
  Database,
  FileText,
  Flame,
  Package,
  Receipt,
  ShoppingBag,
  Tag,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

export type ToolInfo = {
  icone: LucideIcon;
  rotulo: string;
};

export const TOOL_INFO: Record<string, ToolInfo> = {
  consultar_vendas:        { icone: TrendingUp,  rotulo: "Consultando vendas" },
  consultar_faturamento:   { icone: TrendingUp,  rotulo: "Consultando faturamento" },
  consultar_notas_fiscais: { icone: Receipt,     rotulo: "Consultando NF-e" },
  consultar_financeiro:    { icone: Wallet,      rotulo: "Consultando financeiro" },
  consultar_estoque:       { icone: Package,     rotulo: "Consultando estoque" },
  consultar_producao:      { icone: Flame,       rotulo: "Consultando produção" },
  consultar_catalogo:      { icone: Tag,         rotulo: "Consultando catálogo" },
  consultar_clientes:      { icone: Users,       rotulo: "Consultando clientes" },
  consultar_pedidos:       { icone: ShoppingBag, rotulo: "Consultando pedidos" },
  gerar_relatorio_diario:  { icone: FileText,    rotulo: "Gerando relatório diário" },
  bling_consultar_api:     { icone: Database,    rotulo: "Consultando API Bling" },
};

export const TOOL_FALLBACK: ToolInfo = { icone: Zap, rotulo: "Executando ação" };

/** Retorna o ToolInfo para um nome de ferramenta, com fallback. */
export function getToolInfo(nome: string): ToolInfo {
  return TOOL_INFO[nome] ?? TOOL_FALLBACK;
}

/** Tipo do passo de atividade do agente (compartilhado entre Chat e AtividadeCard). */
export type Passo = {
  id: string;
  nome: string;
  args?: Record<string, unknown>;
  resumo?: string;
  status: "rodando" | "concluido" | "erro";
};

/**
 * Formata os args de uma tool call em texto legível para exibição.
 * Ex: { periodo: "mes_atual" } → "periodo: mes_atual"
 */
export function formatarArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("  ·  ");
}
