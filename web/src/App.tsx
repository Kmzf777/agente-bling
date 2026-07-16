import { useState } from "react";

import { Chat } from "@/components/Chat";
import { Login } from "@/components/Login";
import { estaAutenticado, logout } from "@/lib/api";

function App() {
  const [autenticado, setAutenticado] = useState(estaAutenticado);

  const sair = () => {
    void logout();
    setAutenticado(false);
  };

  return (
    <div>
      {autenticado ? (
        <Chat onLogout={sair} />
      ) : (
        <Login onLogin={() => setAutenticado(true)} />
      )}
    </div>
  );
}

export default App;
