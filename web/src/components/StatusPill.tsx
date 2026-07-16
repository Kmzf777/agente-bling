import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusValue = "rodando" | "concluido" | "erro";

type StatusPillProps = {
  status: StatusValue;
  className?: string;
};

const STATUS_CONFIG = {
  rodando: {
    label: "executando",
    icon: Loader2,
    className: "text-muted-foreground bg-muted border-border",
    iconClass: "animate-spin",
  },
  concluido: {
    label: "concluído",
    icon: Check,
    className: "text-primary bg-primary/10 border-primary/20",
    iconClass: "",
  },
  erro: {
    label: "erro",
    icon: AlertTriangle,
    className: "text-destructive bg-destructive/10 border-destructive/20",
    iconClass: "",
  },
} satisfies Record<StatusValue, {
  label: string;
  icon: typeof Loader2;
  className: string;
  iconClass: string;
}>;

/**
 * Pill de status do agente — mostra o estado de um passo de ferramenta.
 * Usa apenas ícones Lucide (sem emoji).
 */
export function StatusPill({ status, className }: StatusPillProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.68rem] font-medium leading-none tracking-wide uppercase",
        config.className,
        className
      )}
      aria-label={`Status: ${config.label}`}
    >
      <Icon
        className={cn("size-2.5 shrink-0", config.iconClass)}
        strokeWidth={2.5}
        aria-hidden
      />
      {config.label}
    </span>
  );
}
