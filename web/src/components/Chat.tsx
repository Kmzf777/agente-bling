import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  FileText,
  LogOut,
  Package,
  TrendingUp,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { enviarChatStream, logout, NaoAutenticado, type Mensagem } from "@/lib/api";
import { renderMarkdownLeve } from "@/lib/markdown";
import { AtividadeCard } from "@/components/AtividadeCard";
import { type Passo } from "@/lib/tools";

const RELATORIO_DE_HOJE = "Gere o relatório de hoje";

/** Item da conversa exibido na UI. `erro` marca bolhas de falha (fora do histórico da API). */
type ItemConversa = Mensagem & { id: number; erro?: boolean };

/** Estado do agente respondendo ao vivo: passos de tool calls + texto parcial. */
type EstadoStream = {
  conteudo: string;
  passos: Passo[];
};

type ChatProps = {
  onLogout: () => void;
};

/** Sugestões rápidas do estado inicial. */
const SUGESTOES: { icone: typeof TrendingUp; rotulo: string; prompt: string }[] = [
  { icone: FileText,   rotulo: "Relatório de hoje",  prompt: RELATORIO_DE_HOJE },
  { icone: TrendingUp, rotulo: "Vendas de hoje",      prompt: "Como estão as vendas de hoje?" },
  { icone: Package,    rotulo: "Estoque baixo",       prompt: "Quais produtos estão com estoque baixo?" },
];

let proximoId = 1;
const novoId = () => proximoId++;

export function Chat({ onLogout }: ChatProps) {
  const [itens, setItens] = useState<ItemConversa[]>([]);
  const [rascunho, setRascunho] = useState("");
  const [pensando, setPensando] = useState(false);
  const [stream, setStream] = useState<EstadoStream | null>(null);

  const fimRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [itens, pensando, stream]);

  const enviar = useCallback(
    async (texto: string) => {
      const limpo = texto.trim();
      if (limpo.length === 0 || pensando) return;

      const historicoApi: Mensagem[] = [
        ...itens.filter((m) => !m.erro).map(({ role, content }) => ({ role, content })),
        { role: "user", content: limpo },
      ];

      setItens((prev) => [...prev, { id: novoId(), role: "user", content: limpo }]);
      setRascunho("");
      setPensando(true);
      setStream({ conteudo: "", passos: [] });

      let acumulado = "";
      try {
        await enviarChatStream(historicoApi, {
          onToolInicio: ({ id, nome, args }) =>
            setStream((s) =>
              s
                ? {
                    ...s,
                    passos: [
                      ...s.passos,
                      { id, nome, args: args ?? {}, status: "rodando" },
                    ],
                  }
                : s
            ),
          onToolFim: ({ id, resumo }) =>
            setStream((s) =>
              s
                ? {
                    ...s,
                    passos: s.passos.map((p) =>
                      p.id === id ? { ...p, status: "concluido", resumo } : p
                    ),
                  }
                : s
            ),
          onDelta: (delta) => {
            acumulado += delta;
            setStream((s) => (s ? { ...s, conteudo: acumulado } : s));
          },
          onFim: (textoFinal) => {
            acumulado = textoFinal || acumulado;
          },
        });
        setItens((prev) => [
          ...prev,
          { id: novoId(), role: "assistant", content: acumulado || "Sem resposta." },
        ]);
      } catch (err) {
        if (err instanceof NaoAutenticado) {
          onLogout();
          return;
        }
        // Mark any still-running steps as error
        setStream((s) =>
          s
            ? {
                ...s,
                passos: s.passos.map((p) =>
                  p.status === "rodando" ? { ...p, status: "erro" } : p
                ),
              }
            : s
        );
        const msg =
          err instanceof Error
            ? err.message
            : "Algo deu errado ao falar com o assistente.";
        setItens((prev) => [
          ...prev,
          { id: novoId(), role: "assistant", content: msg, erro: true },
        ]);
      } finally {
        setStream(null);
        setPensando(false);
        textareaRef.current?.focus();
      }
    },
    [itens, pensando, onLogout]
  );

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar(rascunho);
    }
  }

  async function aoSair() {
    await logout();
    onLogout();
  }

  const vazio = itens.length === 0;

  return (
    <div className="flex h-dvh flex-col bg-background">
      <Cabecalho onSair={aoSair} />

      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
          {vazio ? (
            <EstadoInicial
              onSugestao={(p) => void enviar(p)}
              desabilitado={pensando}
            />
          ) : (
            <ol className="flex flex-col gap-5">
              {itens.map((item) => (
                <Bolha key={item.id} item={item} />
              ))}
              {stream && <AgenteAoVivo estado={stream} />}
            </ol>
          )}
          <div ref={fimRef} className="h-px" aria-hidden />
        </div>
      </ScrollArea>

      <Composer
        ref={textareaRef}
        valor={rascunho}
        pensando={pensando}
        onChange={setRascunho}
        onTeclar={aoTeclar}
        onEnviar={() => void enviar(rascunho)}
        onRelatorio={() => void enviar(RELATORIO_DE_HOJE)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Subcomponentes                                                       */
/* ------------------------------------------------------------------ */

function Cabecalho({ onSair }: { onSair: () => void }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
        {/* Brand icon */}
        <div className="grid size-8 place-items-center rounded-md bg-primary/10 ring-1 ring-primary/20">
          <Zap className="size-4 text-primary" strokeWidth={2} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-none text-foreground tracking-tight">
            Canastra
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-primary" aria-hidden />
            Agente Bling · online
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onSair}
          className="text-muted-foreground hover:text-foreground gap-1.5"
          aria-label="Sair"
        >
          <LogOut className="size-3.5" aria-hidden />
          Sair
        </Button>
      </div>
    </header>
  );
}

function EstadoInicial({
  onSugestao,
  desabilitado,
}: {
  onSugestao: (prompt: string) => void;
  desabilitado: boolean;
}) {
  return (
    <div className="animate-rise flex flex-col items-center py-12 text-center sm:py-16">
      {/* Logo mark */}
      <div className="grid size-14 place-items-center rounded-xl border border-border bg-card shadow-sm">
        <Bot className="size-6 text-primary" strokeWidth={1.75} />
      </div>

      <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        Como posso ajudar?
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Pergunte sobre vendas, faturamento, estoque e produção — consulto o
        seu Bling e trago os dados.
      </p>

      <div className="mt-8 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-3">
        {SUGESTOES.map(({ icone: Icone, rotulo, prompt }) => (
          <button
            key={rotulo}
            type="button"
            disabled={desabilitado}
            onClick={() => onSugestao(prompt)}
            className={cn(
              "group flex flex-col items-start gap-2.5 rounded-md border border-border bg-card p-3.5 text-left transition-all duration-150",
              "hover:border-primary/40 hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
          >
            <Icone className="size-4 text-primary" strokeWidth={2} aria-hidden />
            <span className="text-sm font-medium text-foreground">{rotulo}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Bolha({ item }: { item: ItemConversa }) {
  const doUsuario = item.role === "user";

  if (doUsuario) {
    return (
      <li className="animate-pour flex justify-end">
        <div className="max-w-[85%] rounded-md rounded-br-sm bg-primary px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground">
          {item.content}
        </div>
      </li>
    );
  }

  if (item.erro) {
    return (
      <li className="animate-pour flex justify-start">
        <div className="flex max-w-[88%] items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={2} aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-destructive text-sm">Não consegui responder agora</p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.content}</p>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="animate-pour flex justify-start">
      <div className="flex max-w-[90%] gap-3">
        <div className="mt-0.5 grid size-6 shrink-0 place-items-center self-start rounded-md bg-primary/10 ring-1 ring-primary/15">
          <Bot className="size-3.5 text-primary" strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 rounded-md rounded-tl-sm border border-border bg-card px-3.5 py-3 text-sm text-card-foreground leading-relaxed">
          {renderMarkdownLeve(item.content)}
        </div>
      </div>
    </li>
  );
}

/**
 * Agente respondendo AO VIVO: mostra os AtividadeCard por passo de tool call,
 * depois o texto conforme é transmitido. Indicador "processando" quando sem passos.
 */
function AgenteAoVivo({ estado }: { estado: EstadoStream }) {
  const temTexto = estado.conteudo.length > 0;
  const temPassos = estado.passos.length > 0;

  return (
    <li className="animate-pour flex justify-start">
      <div className="flex max-w-[90%] gap-3">
        {/* Bot avatar */}
        <div className="mt-0.5 grid size-6 shrink-0 place-items-center self-start rounded-md bg-primary/10 ring-1 ring-primary/15">
          <Bot className="size-3.5 text-primary" strokeWidth={2} aria-hidden />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          {/* Tool activity cards */}
          {temPassos && (
            <ul className="flex flex-col gap-1.5" aria-label="Atividade do agente">
              {estado.passos.map((passo) => (
                <li key={passo.id}>
                  <AtividadeCard passo={passo} />
                </li>
              ))}
            </ul>
          )}

          {/* Streamed answer text */}
          {temTexto ? (
            <div className="min-w-0 rounded-md rounded-tl-sm border border-border bg-card px-3.5 py-3 text-sm text-card-foreground leading-relaxed">
              {renderMarkdownLeve(estado.conteudo)}
            </div>
          ) : !temPassos ? (
            /* Initial "processing" indicator — no tool calls yet */
            <div
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-3"
              aria-label="Processando"
            >
              <span className="flex items-end gap-0.5">
                <PontoPulsante atraso="0ms" />
                <PontoPulsante atraso="160ms" />
                <PontoPulsante atraso="320ms" />
              </span>
              <span className="text-sm text-muted-foreground">Processando…</span>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function PontoPulsante({ atraso }: { atraso: string }) {
  return (
    <span
      className="animate-pulse-soft block size-1.5 rounded-full bg-muted-foreground"
      style={{ animationDelay: atraso }}
      aria-hidden
    />
  );
}

type ComposerProps = {
  valor: string;
  pensando: boolean;
  onChange: (v: string) => void;
  onTeclar: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onEnviar: () => void;
  onRelatorio: () => void;
  ref: React.Ref<HTMLTextAreaElement>;
};

function Composer({
  valor,
  pensando,
  onChange,
  onTeclar,
  onEnviar,
  onRelatorio,
  ref,
}: ComposerProps) {
  const podeEnviar = valor.trim().length > 0 && !pensando;

  return (
    <div className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 py-3 sm:px-6">
        {/* Quick action */}
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pensando}
            onClick={onRelatorio}
            className="rounded-md border-border text-muted-foreground hover:text-foreground hover:border-primary/40 gap-1.5"
          >
            <FileText className="size-3.5" aria-hidden />
            Relatório de hoje
          </Button>
        </div>

        {/* Input container */}
        <div
          className={cn(
            "flex items-end gap-2 rounded-md border border-border bg-card px-2 py-2 transition-colors duration-150",
            "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
          )}
        >
          <Textarea
            ref={ref}
            value={valor}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onTeclar}
            disabled={pensando}
            rows={1}
            placeholder="Pergunte sobre vendas, estoque, faturamento…"
            aria-label="Mensagem"
            className="max-h-40 min-h-0 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm shadow-none focus-visible:ring-0 disabled:opacity-70"
          />
          <Button
            type="button"
            size="icon"
            aria-label="Enviar mensagem"
            disabled={!podeEnviar}
            onClick={onEnviar}
            className="size-8 shrink-0 rounded-md transition-all duration-150 active:scale-95"
          >
            <ArrowUp className="size-4" aria-hidden />
          </Button>
        </div>

        <p className="mt-2 px-1 text-center text-[0.68rem] text-muted-foreground/60">
          Enter envia · Shift+Enter quebra linha
        </p>
      </div>
    </div>
  );
}

export default Chat;
