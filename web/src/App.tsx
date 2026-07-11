import { useState } from "react";

import { Login } from "@/components/Login";

function App() {
  const [autenticado, setAutenticado] = useState(false);

  if (!autenticado) {
    return <Login onLogin={() => setAutenticado(true)} />;
  }

  // A UI de chat entra na Task 20.
  return (
    <main className="grid min-h-dvh place-items-center bg-background text-foreground">
      <p className="text-sm text-muted-foreground">Autenticado.</p>
    </main>
  );
}

export default App;
