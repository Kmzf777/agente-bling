import { useState } from "react";

import { Chat } from "@/components/Chat";
import { Login } from "@/components/Login";

function App() {
  const [autenticado, setAutenticado] = useState(false);

  return (
    <div className="canastra-grain">
      {autenticado ? (
        <Chat onLogout={() => setAutenticado(false)} />
      ) : (
        <Login onLogin={() => setAutenticado(true)} />
      )}
    </div>
  );
}

export default App;
