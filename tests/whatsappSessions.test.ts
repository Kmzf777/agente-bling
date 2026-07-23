import { describe, it, expect } from "vitest";
import { criarSessions } from "../src/whatsapp/sessions";

describe("sessions do WhatsApp", () => {
  it("cria sessão nova não autenticada", () => {
    const s = criarSessions(30);
    const sess = s.obter("5531999");
    expect(sess.autenticado).toBe(false);
    expect(sess.mensagens).toEqual([]);
  });

  it("persiste estado entre chamadas do mesmo número", () => {
    const s = criarSessions(30);
    const sess = s.obter("5531999");
    sess.autenticado = true;
    sess.mensagens.push({ role: "user", content: "oi" });
    expect(s.obter("5531999").autenticado).toBe(true);
    expect(s.obter("5531999").mensagens).toHaveLength(1);
  });

  it("expira após o timeout de inatividade e reseta a sessão", () => {
    let t = 1_000_000;
    const s = criarSessions(30, () => t);
    const sess = s.obter("5531999");
    sess.autenticado = true;
    s.tocar("5531999");
    t += 31 * 60 * 1000;
    expect(s.obter("5531999").autenticado).toBe(false);
  });

  it("tocar renova a expiração", () => {
    let t = 1_000_000;
    const s = criarSessions(30, () => t);
    const sess = s.obter("5531999");
    sess.autenticado = true;
    t += 20 * 60 * 1000;
    s.tocar("5531999");
    t += 20 * 60 * 1000;
    expect(s.obter("5531999").autenticado).toBe(true);
  });

  it("limpar remove a sessão", () => {
    const s = criarSessions(30);
    s.obter("5531999").autenticado = true;
    s.limpar("5531999");
    expect(s.obter("5531999").autenticado).toBe(false);
  });
});
