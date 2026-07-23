import { describe, it, expect, vi } from "vitest";
import { parseMensagem } from "../src/whatsapp/webhook";

const base = (over: any = {}) => ({
  event: "messages.upsert",
  instance: "canastra",
  data: {
    key: { remoteJid: "5531999@s.whatsapp.net", fromMe: false, id: "abc" },
    message: { conversation: "quanto vendi hoje?" },
    ...over,
  },
});

describe("parseMensagem", () => {
  it("extrai numero e texto de conversation", () => {
    expect(parseMensagem(base())).toEqual({ numero: "5531999", texto: "quanto vendi hoje?" });
  });

  it("extrai texto de extendedTextMessage", () => {
    const body = base({ message: { extendedTextMessage: { text: "e no mês passado?" } } });
    expect(parseMensagem(body)).toEqual({ numero: "5531999", texto: "e no mês passado?" });
  });

  it("ignora mensagens próprias (fromMe)", () => {
    const body = base({ key: { remoteJid: "5531999@s.whatsapp.net", fromMe: true, id: "x" } });
    expect(parseMensagem(body)).toBeNull();
  });

  it("ignora grupos (@g.us)", () => {
    const body = base({ key: { remoteJid: "12345@g.us", fromMe: false, id: "x" } });
    expect(parseMensagem(body)).toBeNull();
  });

  it("ignora mensagens sem texto", () => {
    const body = base({ message: { imageMessage: {} } });
    expect(parseMensagem(body)).toBeNull();
  });

  it("ignora payload malformado", () => {
    expect(parseMensagem({})).toBeNull();
    expect(parseMensagem(null)).toBeNull();
  });
});
