import { useState, type FormEvent } from "react";
import { Coffee, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/api";

type LoginProps = {
  onLogin: () => void;
};

export function Login({ onLogin }: LoginProps) {
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (carregando || senha.length === 0) return;

    setCarregando(true);
    setErro(null);
    try {
      const ok = await login(senha);
      if (ok) {
        onLogin();
      } else {
        setErro("Senha inválida.");
        setSenha("");
      }
    } catch {
      setErro("Não foi possível conectar. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="canastra-topo relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-5 py-10">
      {/* Atmosfera: brilho de crema subindo do rodapé, como vapor. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-[-30%] h-[70%] bg-[radial-gradient(60%_100%_at_50%_100%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_70%)] blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] size-[28rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--crema)_16%,transparent),transparent_65%)] blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        {/* Marca */}
        <header className="animate-rise mb-8 flex flex-col items-center text-center [animation-delay:60ms]">
          <BrandMark />
          <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-foreground">
            Canastra
          </h1>
          <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
            Seu assistente para o café artesanal da Serra da Canastra.
          </p>
        </header>

        <Card className="animate-rise border-0 py-0 shadow-2xl shadow-black/30 ring-1 ring-border/80 [animation-delay:180ms]">
          <CardContent className="px-6 py-7">
            <div className="mb-5 flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              Acesso ao painel
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={aoEnviar} className="flex flex-col gap-4" noValidate>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground/90">Senha</span>
                <div className="relative">
                  <KeyRound
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    type="password"
                    autoFocus
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    aria-label="Senha"
                    aria-invalid={erro !== null}
                    value={senha}
                    disabled={carregando}
                    onChange={(e) => {
                      setSenha(e.target.value);
                      if (erro) setErro(null);
                    }}
                    className="h-11 rounded-xl pl-9 text-[0.95rem]"
                  />
                </div>
              </label>

              {erro && (
                <p
                  role="alert"
                  className="animate-pour -mt-1 text-sm font-medium text-destructive"
                >
                  {erro}
                </p>
              )}

              <Button
                type="submit"
                disabled={carregando || senha.length === 0}
                className="mt-1 h-11 rounded-xl text-[0.95rem] font-semibold shadow-lg shadow-primary/20 transition-transform hover:brightness-105 active:scale-[0.99]"
              >
                {carregando ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Entrando…
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="animate-rise mt-6 text-center text-xs text-muted-foreground/70 [animation-delay:300ms]">
          Serra da Canastra · Minas Gerais
        </p>
      </div>
    </main>
  );
}

/**
 * Selo da marca: uma xícara sobre a silhueta das serras — a assinatura visual
 * do Canastra. Desenhado em SVG para nitidez em qualquer densidade.
 */
function BrandMark() {
  return (
    <div className="relative grid size-16 place-items-center rounded-2xl bg-gradient-to-b from-primary/25 to-primary/5 ring-1 ring-primary/30">
      <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_25%,color-mix(in_oklch,var(--crema)_28%,transparent),transparent_60%)]" />
      <Coffee className="relative size-7 text-primary" strokeWidth={1.75} />
      <svg
        aria-hidden
        viewBox="0 0 64 20"
        className="absolute -bottom-px left-0 h-4 w-full text-primary/40"
      >
        <path
          d="M0 18 L14 8 L24 14 L36 4 L48 12 L64 6 L64 20 L0 20 Z"
          fill="currentColor"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}

export default Login;
