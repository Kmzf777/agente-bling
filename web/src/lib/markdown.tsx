import { Fragment, type ReactNode } from "react";

/**
 * Renderizador de "markdown-leve" — sem dependências.
 *
 * O agente costuma responder em texto com quebras de linha e um toque de
 * markdown (títulos com `#`, listas com `-`/`•`, `**negrito**`, `` `código` ``).
 * Aqui cobrimos só o essencial para ficar legível — nada de HTML arbitrário,
 * então é seguro por construção (renderizamos apenas nós React controlados).
 */

/** Aplica formatação inline (negrito e código) a um trecho de texto. */
function inline(texto: string, chaveBase: string): ReactNode[] {
  const nos: ReactNode[] = [];
  // Alterna entre **negrito** e `código`, preservando o restante como texto.
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const partes = texto.split(regex);

  partes.forEach((parte, i) => {
    if (!parte) return;
    if (parte.startsWith("**") && parte.endsWith("**")) {
      nos.push(
        <strong key={`${chaveBase}-b-${i}`} className="font-semibold text-foreground">
          {parte.slice(2, -2)}
        </strong>
      );
    } else if (parte.startsWith("`") && parte.endsWith("`")) {
      nos.push(
        <code
          key={`${chaveBase}-c-${i}`}
          className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
        >
          {parte.slice(1, -1)}
        </code>
      );
    } else {
      nos.push(<Fragment key={`${chaveBase}-t-${i}`}>{parte}</Fragment>);
    }
  });

  return nos;
}

const RE_TITULO = /^(#{1,3})\s+(.*)$/;
const RE_LISTA = /^\s*[-*•]\s+(.*)$/;

/**
 * Converte texto em blocos React legíveis, preservando quebras de linha,
 * títulos, listas e formatação inline. Retorna um único fragmento.
 */
export function renderMarkdownLeve(texto: string): ReactNode {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const blocos: ReactNode[] = [];
  let itensLista: ReactNode[] = [];

  const fecharLista = () => {
    if (itensLista.length === 0) return;
    blocos.push(
      <ul key={`ul-${blocos.length}`} className="my-1 ml-1 flex flex-col gap-1">
        {itensLista}
      </ul>
    );
    itensLista = [];
  };

  linhas.forEach((linha, i) => {
    const titulo = linha.match(RE_TITULO);
    if (titulo) {
      fecharLista();
      const nivel = titulo[1].length;
      const conteudo = inline(titulo[2], `h-${i}`);
      const cls =
        nivel === 1
          ? "font-heading text-base font-semibold text-foreground"
          : "font-heading text-[0.95rem] font-semibold text-foreground";
      blocos.push(
        <p key={`h-${i}`} className={`mt-1 first:mt-0 ${cls}`}>
          {conteudo}
        </p>
      );
      return;
    }

    const item = linha.match(RE_LISTA);
    if (item) {
      itensLista.push(
        <li key={`li-${i}`} className="flex gap-2">
          <span aria-hidden className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-primary/70" />
          <span className="min-w-0">{inline(item[1], `li-${i}`)}</span>
        </li>
      );
      return;
    }

    fecharLista();

    if (linha.trim() === "") {
      // Linha em branco vira um respiro vertical entre parágrafos.
      blocos.push(<div key={`sp-${i}`} className="h-2" aria-hidden />);
      return;
    }

    blocos.push(
      <p key={`p-${i}`} className="leading-relaxed">
        {inline(linha, `p-${i}`)}
      </p>
    );
  });

  fecharLista();

  return <>{blocos}</>;
}
