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
  Coffee,
  Database,
  FileText,
  Flame,
  LogOut,
  Package,
  Receipt,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { enviarChatStream, logout, NaoAutenticado, type Mensagem } from "@/lib/api";
import { renderMarkdownLeve } from "@/lib/markdown";

const RELATORIO_DE_HOJE = "Gere o relatório de hoje";

/** Item da conversa exibido na UI. `erro` marca bolhas de falha (fora do histórico da API). */
type ItemConversa = Mensagem & { id: number; erro?: boolean };

/** Estado do agente respondendo ao vivo: ferramentas acionadas + texto parcial. */
type EstadoStream = { conteudo: string; ferramentas: string[] };

/** Mapeia cada ferramenta do agente a um ícone + rótulo amigável para a timeline ao vivo. */
const TOOL_INFO: Record<string, { icone: typeof TrendingUp; rotulo: string }> = {
  consultar_vendas: { icone: TrendingUp, rotulo: "Analisando vendas" },
  consultar_faturamento: { icone: TrendingUp, rotulo: "Somando o faturamento" },
  consultar_notas_fiscais: { icone: Receipt, rotulo: "Lendo notas fiscais (CFOP)" },
  consultar_financeiro: { icone: Wallet, rotulo: "Conferindo o financeiro" },
  consultar_estoque: { icone: Package, rotulo: "Checando o estoque" },
  consultar_producao: { icone: Flame, rotulo: "Vendo a produção" },
  consultar_catalogo: { icone: Tag, rotulo: "Consultando o catálogo" },
  consultar_clientes: { icone: Users, rotulo: "Buscando clientes" },
  consultar_pedidos: { icone: ShoppingBag, rotulo: "Abrindo pedidos" },
  gerar_relatorio_diario: { icone: FileText, rotulo: "Montando o relatório" },
  bling_consultar_api: { icone: Database, rotulo: "Consultando o Bling" },
};
const TOOL_FALLBACK = { icone: Coffee, rotulo: "Consultando o Bling" };

type ChatProps = {
  onLogout: () => void;
};

/** Sugestões rápidas do estado inicial. */
const SUGESTOES: { icone: typeof TrendingUp; rotulo: string; prompt: string }[] = [
  { icone: FileText, rotulo: "Relatório de hoje", prompt: RELATORIO_DE_HOJE },
  { icone: TrendingUp, rotulo: "Vendas de hoje", prompt: "Como estão as vendas de hoje?" },
  { icone: Package, rotulo: "Estoque baixo", prompt: "Quais produtos estão com estoque baixo?" },
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

  // Auto-scroll para a mensagem mais recente (e enquanto o agente responde ao vivo).
  // O sentinela no fim do conteúdo é revelado dentro do viewport rolável do ScrollArea.
  useLayoutEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [itens, pensando, stream]);

  const enviar = useCallback(
    async (texto: string) => {
      const limpo = texto.trim();
      if (limpo.length === 0 || pensando) return;

      // Monta o histórico da API (apenas mensagens reais, sem bolhas de erro).
      const historicoApi: Mensagem[] = [
        ...itens.filter((m) => !m.erro).map(({ role, content }) => ({ role, content })),
        { role: "user", content: limpo },
      ];

      setItens((prev) => [...prev, { id: novoId(), role: "user", content: limpo }]);
      setRascunho("");
      setPensando(true);
      setStream({ conteudo: "", ferramentas: [] });

      let acumulado = "";
      try {
        await enviarChatStream(historicoApi, {
          onTool: (nome) =>
            setStream((s) => (s ? { ...s, ferramentas: [...s.ferramentas, nome] } : s)),
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
        // Devolve o foco ao campo para manter o fluxo de conversa.
        textareaRef.current?.focus();
      }
    },
    [itens, pensando, onLogout]
  );

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha.
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
    <div className="canastra-topo flex h-dvh flex-col bg-background">
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
          {/* Sentinela para o auto-scroll. */}
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
/* Subcomponentes                                                      */
/* ------------------------------------------------------------------ */

function Cabecalho({ onSair }: { onSair: () => void }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-b from-primary/25 to-primary/5 ring-1 ring-primary/25">
          <Coffee className="size-5 text-primary" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-lg leading-none font-semibold text-foreground">
            Canastra
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_25%,transparent)]" />
            Assistente do café · online
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSair}
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-4" />
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
    <div className="animate-rise flex flex-col items-center py-10 text-center sm:py-16">
      <div className="relative grid size-16 place-items-center rounded-2xl bg-gradient-to-b from-primary/25 to-primary/5 ring-1 ring-primary/30">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_25%,color-mix(in_oklch,var(--crema)_28%,transparent),transparent_60%)]" />
        <Sparkles className="relative size-7 text-primary" strokeWidth={1.75} />
      </div>
      <h2 className="mt-6 font-heading text-2xl font-semibold text-foreground sm:text-3xl">
        Bom dia. Como posso ajudar?
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Pergunte sobre vendas, faturamento, estoque e produção — eu consulto o
        seu Bling e trago os números do café.
      </p>

      <div className="mt-8 grid w-full max-w-md grid-cols-1 gap-2.5 sm:grid-cols-3">
        {SUGESTOES.map(({ icone: Icone, rotulo, prompt }) => (
          <button
            key={rotulo}
            type="button"
            disabled={desabilitado}
            onClick={() => onSugestao(prompt)}
            className={cn(
              "group flex flex-col items-start gap-2 rounded-xl border border-border/80 bg-card/60 p-3.5 text-left transition-all",
              "hover:border-primary/40 hover:bg-card hover:shadow-lg hover:shadow-black/10",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
          >
            <Icone className="size-4 text-primary transition-transform group-hover:scale-110" />
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
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[0.95rem] leading-relaxed whitespace-pre-wrap text-primary-foreground shadow-md shadow-primary/20">
          {item.content}
        </div>
      </li>
    );
  }

  if (item.erro) {
    return (
      <li className="animate-pour flex justify-start">
        <div className="flex max-w-[85%] items-start gap-2.5 rounded-2xl rounded-bl-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-[0.95rem] text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-medium text-destructive">Não consegui responder agora</p>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">{item.content}</p>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="animate-pour flex justify-start">
      <div className="flex max-w-[90%] gap-3">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center self-start rounded-lg bg-gradient-to-b from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <Coffee className="size-3.5 text-primary" strokeWidth={2} />
        </div>
        <div className="min-w-0 rounded-2xl rounded-tl-md bg-card px-4 py-3 text-[0.95rem] text-card-foreground ring-1 ring-border/70">
          {renderMarkdownLeve(item.content)}
        </div>
      </div>
    </li>
  );
}

/**
 * Agente respondendo AO VIVO: mostra a timeline de ferramentas acionadas (cada consulta
 * ao Bling com ícone + rótulo) e o texto conforme ele é transmitido — o usuário vê o
 * agente trabalhando, em vez de só um "pensando…" opaco.
 */
function AgenteAoVivo({ estado }: { estado: EstadoStream }) {
  const temTexto = estado.conteudo.length > 0;
  const semNada = !temTexto && estado.ferramentas.length === 0;

  return (
    <li className="animate-pour flex justify-start">
      <div className="flex max-w-[90%] gap-3">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center self-start rounded-lg bg-gradient-to-b from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <Coffee className="size-3.5 text-primary" strokeWidth={2} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          {estado.ferramentas.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {estado.ferramentas.map((nome, i) => {
                const info = TOOL_INFO[nome] ?? TOOL_FALLBACK;
                const Icone = info.icone;
                const ativo = !temTexto && i === estado.ferramentas.length - 1;
                return (
                  <li
                    key={i}
                    className="animate-pour flex items-center gap-2 text-xs"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded-md bg-primary/10 ring-1 ring-primary/15">
                      <Icone className="size-3 text-primary" strokeWidth={2} />
                    </span>
                    <span className={cn(ativo ? "text-foreground" : "text-muted-foreground")}>
                      {info.rotulo}…
                    </span>
                    {ativo && (
                      <span className="ml-0.5 flex items-end gap-0.5">
                        <Ponto atraso="0ms" />
                        <Ponto atraso="180ms" />
                        <Ponto atraso="360ms" />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {temTexto ? (
            <div className="min-w-0 rounded-2xl rounded-tl-md bg-card px-4 py-3 text-[0.95rem] text-card-foreground ring-1 ring-border/70">
              {renderMarkdownLeve(estado.conteudo)}
            </div>
          ) : (
            semNada && (
              <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-md bg-card px-4 py-3 ring-1 ring-border/70">
                <div className="flex items-end gap-1">
                  <Ponto atraso="0ms" />
                  <Ponto atraso="180ms" />
                  <Ponto atraso="360ms" />
                </div>
                <span className="text-sm text-muted-foreground">pensando…</span>
              </div>
            )
          )}
        </div>
      </div>
    </li>
  );
}

function Ponto({ atraso }: { atraso: string }) {
  return (
    <span
      className="animate-steam block size-1.5 rounded-full bg-primary"
      style={{ animationDelay: atraso }}
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
    <div className="border-t border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto w-full max-w-2xl px-4 py-3 sm:px-6">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pensando}
            onClick={onRelatorio}
            className="rounded-full border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
          >
            <FileText className="size-3.5" />
            Relatório de hoje
          </Button>
        </div>

        <div
          className={cn(
            "flex items-end gap-2 rounded-2xl border border-input bg-card/70 p-2 transition-colors",
            "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
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
            className="max-h-40 min-h-0 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[0.95rem] shadow-none focus-visible:ring-0 disabled:opacity-70"
          />
          <Button
            type="button"
            size="icon"
            aria-label="Enviar mensagem"
            disabled={!podeEnviar}
            onClick={onEnviar}
            className="size-9 shrink-0 rounded-xl shadow-md shadow-primary/20 transition-transform hover:brightness-105 active:scale-95"
          >
            <ArrowUp className="size-4.5" />
          </Button>
        </div>
        <p className="mt-2 px-1 text-center text-[0.7rem] text-muted-foreground/70">
          Enter envia · Shift + Enter quebra linha
        </p>
      </div>
    </div>
  );
}

export default Chat;
