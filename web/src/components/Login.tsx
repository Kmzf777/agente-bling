import { useState, type FormEvent } from "react";
import { KeyRound, Loader2, Zap } from "lucide-react";

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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-5 py-10">
      {/* Subtle green glow at bottom — brand presence without warmth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-[-20%] h-[50%] bg-[radial-gradient(60%_80%_at_50%_100%,color-mix(in_oklch,#3ECF8E_12%,transparent),transparent_70%)] blur-2xl"
      />

      <div className="relative w-full max-w-sm">
        {/* Brand header */}
        <header className="animate-rise mb-8 flex flex-col items-center text-center [animation-delay:60ms]">
          <div className="grid size-12 place-items-center rounded-xl border border-border bg-card shadow-sm">
            <Zap className="size-5 text-primary" strokeWidth={2} aria-hidden />
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
            Canastra
          </h1>
          <p className="mt-2 max-w-[18rem] text-sm leading-relaxed text-muted-foreground">
            Agente de dados do Bling — consultas em linguagem natural.
          </p>
        </header>

        {/* Login card */}
        <Card className="animate-rise border-border bg-card shadow-xl [animation-delay:120ms]">
          <CardContent className="px-6 py-6">
            {/* Divider label */}
            <div className="mb-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" aria-hidden />
              <span className="font-medium tracking-widest uppercase">Acesso</span>
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>

            <form onSubmit={aoEnviar} className="flex flex-col gap-4" noValidate>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Senha</span>
                <div className="relative">
                  <KeyRound
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    strokeWidth={2}
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
                    className="pl-9"
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
                className="mt-1 h-9 w-full text-sm font-semibold transition-all duration-150 active:scale-[0.99]"
              >
                {carregando ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Entrando…
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="animate-rise mt-6 text-center text-xs text-muted-foreground/60 [animation-delay:240ms]">
          Serra da Canastra · Minas Gerais
        </p>
      </div>
    </main>
  );
}

export default Login;
