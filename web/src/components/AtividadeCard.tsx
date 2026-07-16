import { cn } from "@/lib/utils";
import { getToolInfo, formatarArgs, type Passo } from "@/lib/tools";
import { StatusPill } from "@/components/StatusPill";

type AtividadeCardProps = {
  passo: Passo;
  className?: string;
};

/**
 * Card de atividade do agente — exibe uma tool call com:
 *  - ícone Lucide + rótulo humano da ferramenta
 *  - parâmetros em fonte mono
 *  - StatusPill (rodando / concluido / erro)
 *  - resumo do resultado (mono) quando concluído
 */
export function AtividadeCard({ passo, className }: AtividadeCardProps) {
  const { icone: Icone, rotulo } = getToolInfo(passo.nome);
  const temArgs = passo.args && Object.keys(passo.args).length > 0;
  const temResumo = passo.status !== "rodando" && passo.resumo;

  return (
    <div
      className={cn(
        "animate-pour flex items-start gap-3 rounded-md border border-border bg-card px-3.5 py-3",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={`${rotulo}: ${passo.status}`}
    >
      {/* Tool icon */}
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 ring-1 ring-primary/15">
        <Icone className="size-3.5 text-primary" strokeWidth={2} aria-hidden />
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground leading-snug">
            {rotulo}
          </span>
          <StatusPill status={passo.status} />
        </div>

        {/* Args in mono */}
        {temArgs && (
          <p className="mt-1 font-mono text-[0.72rem] leading-snug text-muted-foreground break-all">
            {formatarArgs(passo.args!)}
          </p>
        )}

        {/* Result summary in mono */}
        {temResumo && (
          <p className="mt-1.5 font-mono text-[0.75rem] leading-snug text-foreground/80">
            {passo.resumo}
          </p>
        )}
      </div>
    </div>
  );
}
