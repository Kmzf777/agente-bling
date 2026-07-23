import { describe, it, expect, vi } from "vitest";
import { criarEvolutionClient } from "../src/whatsapp/evolutionClient";

describe("evolutionClient.sendText", () => {
  it("faz POST no endpoint da instância com apikey e body correto", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    const client = criarEvolutionClient(
      { url: "http://localhost:8080", apiKey: "K", instance: "canastra" },
      fetchMock as any,
    );
    await client.sendText("5531999", "olá");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8080/message/sendText/canastra");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("K");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ number: "5531999", text: "olá" });
  });

  it("não lança se a Evolution responder erro (só loga)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "erro" });
    const client = criarEvolutionClient({ url: "http://localhost:8080", apiKey: "K", instance: "i" }, fetchMock as any);
    await expect(client.sendText("5531999", "x")).resolves.toBeUndefined();
  });
});
