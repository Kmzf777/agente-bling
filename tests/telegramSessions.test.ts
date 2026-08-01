import { describe, it, expect } from "vitest";
import { criarSessions } from "../src/telegram/sessions";

describe("sessions do Telegram", () => {
  it("cria sessão nova não autenticada", () => {
    const s = criarSessions(30);
    const sess = s.obter("987654321");
    expect(sess.autenticado).toBe(false);
    expect(sess.mensagens).toEqual([]);
  });

  it("persiste estado entre chamadas do mesmo chatId", () => {
    const s = criarSessions(30);
    const sess = s.obter("987654321");
    sess.autenticado = true;
    sess.mensagens.push({ role: "user", content: "oi" });
    expect(s.obter("987654321").autenticado).toBe(true);
    expect(s.obter("987654321").mensagens).toHaveLength(1);
  });

  it("expira após o timeout de inatividade e reseta a sessão", () => {
    let t = 1_000_000;
    const s = criarSessions(30, () => t);
    const sess = s.obter("987654321");
    sess.autenticado = true;
    s.tocar("987654321");
    t += 31 * 60 * 1000;
    expect(s.obter("987654321").autenticado).toBe(false);
  });

  it("tocar renova a expiração", () => {
    let t = 1_000_000;
    const s = criarSessions(30, () => t);
    const sess = s.obter("987654321");
    sess.autenticado = true;
    t += 20 * 60 * 1000;
    s.tocar("987654321");
    t += 20 * 60 * 1000;
    expect(s.obter("987654321").autenticado).toBe(true);
  });

  it("limpar remove a sessão", () => {
    const s = criarSessions(30);
    s.obter("987654321").autenticado = true;
    s.limpar("987654321");
    expect(s.obter("987654321").autenticado).toBe(false);
  });
});
