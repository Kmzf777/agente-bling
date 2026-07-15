const BASE = "https://api.bling.com.br/Api/v3";

interface Opts { tokenManager: { getAccessToken(): Promise<string>; forceRefresh(): Promise<string> };
  fetchImpl?: typeof fetch; minIntervalMs?: number; }

export class BlingClient {
  private fetchImpl: typeof fetch;
  private minIntervalMs: number;
  private last = 0;
  private gate: Promise<void> = Promise.resolve();
  constructor(private o: Opts) {
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.minIntervalMs = o.minIntervalMs ?? 400; // ~2,5 req/s: margem sob o limite de 3/s do Bling
  }
  // Serializa TODAS as requisições (inclusive as concorrentes), espaçando cada uma por
  // minIntervalMs. Sem isso, chamadas em paralelo (ex.: as 4 seções do relatório) disparam
  // em rajada e estouram o limite do Bling (3 req/s) → 429 intermitente.
  private throttle(): Promise<void> {
    const run = this.gate.then(async () => {
      const wait = this.last + this.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
    });
    this.gate = run.catch(() => {});
    return run;
  }
  private buildUrl(path: string, query: Record<string, unknown> = {}) {
    const u = new URL(BASE + path);
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) for (const item of v) u.searchParams.append(k, String(item));
      else u.searchParams.set(k, String(v));
    }
    return u.toString();
  }
  async get<T = any>(path: string, query: Record<string, unknown> = {}, _retried = false): Promise<T> {
    await this.throttle();
    const token = await this.o.tokenManager.getAccessToken();
    const res = await this.fetchImpl(this.buildUrl(path, query), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 401 && !_retried) { await this.o.tokenManager.forceRefresh(); return this.get<T>(path, query, true); }
    if (res.status === 429 && !_retried) {
      const ra = Number(res.headers?.get?.("Retry-After")) || 1;
      await new Promise((r) => setTimeout(r, ra * 1000));
      return this.get<T>(path, query, true);
    }
    if (!res.ok) throw new Error(`Bling GET ${path} falhou (HTTP ${res.status})`);
    return (await res.json()) as T;
  }
  async getAllPages<T = any>(path: string, query: Record<string, unknown> = {},
    { limite = 100, maxPaginas = 20 } = {}): Promise<T[]> {
    const out: T[] = [];
    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      const resp = await this.get<{ data: T[] }>(path, { ...query, pagina, limite });
      const data = resp.data ?? [];
      out.push(...data);
      if (data.length < limite) break;
    }
    return out;
  }
}
