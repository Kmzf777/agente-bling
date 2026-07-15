import { promises as fs } from "node:fs";

const TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";
const MARGIN_MS = 60_000;

export interface StoredTokens { access_token: string; refresh_token: string; expires_at: number; }
interface TokenResponse { access_token: string; refresh_token: string; expires_in: number; }

export interface TokenManagerOpts {
  clientId: string; clientSecret: string; tokenFile: string;
  fetchImpl?: typeof fetch; now?: () => number;
}

export class TokenManager {
  private o: Required<TokenManagerOpts>;
  constructor(opts: TokenManagerOpts) {
    this.o = { fetchImpl: fetch, now: () => Date.now(), ...opts };
  }
  private basic() { return "Basic " + Buffer.from(`${this.o.clientId}:${this.o.clientSecret}`).toString("base64"); }

  private async read(): Promise<StoredTokens> {
    return JSON.parse(await fs.readFile(this.o.tokenFile, "utf8"));
  }
  async setTokens(r: TokenResponse): Promise<void> {
    const data: StoredTokens = {
      access_token: r.access_token, refresh_token: r.refresh_token,
      expires_at: this.o.now() + r.expires_in * 1000,
    };
    await fs.writeFile(this.o.tokenFile, JSON.stringify(data, null, 2));
  }

  async getAccessToken(): Promise<string> {
    const t = await this.read();
    if (this.o.now() < t.expires_at - MARGIN_MS) return t.access_token;
    return this.dedupeRefresh(t.refresh_token);
  }

  // Força a renovação a partir do refresh_token salvo (usado em 401).
  async forceRefresh(): Promise<string> {
    const t = await this.read();
    return this.dedupeRefresh(t.refresh_token);
  }

  // O Bling ROTACIONA o refresh_token a cada uso. Se N chamadas concorrentes renovassem
  // ao mesmo tempo, só a 1ª venceria e as outras usariam um token já invalidado → falha.
  // Aqui deduplicamos: renovações simultâneas compartilham UMA única promessa (single-flight).
  private inFlightRefresh: Promise<string> | null = null;
  private dedupeRefresh(refreshToken: string): Promise<string> {
    if (!this.inFlightRefresh) {
      this.inFlightRefresh = this.refresh(refreshToken).finally(() => { this.inFlightRefresh = null; });
    }
    return this.inFlightRefresh;
  }

  async refresh(refreshToken: string): Promise<string> {
    const res = await this.o.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: this.basic(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
    });
    if (!res.ok) throw new Error(`Falha ao renovar token Bling (HTTP ${res.status}). Re-autentique via 'npm run bling:auth'.`);
    const json = (await res.json()) as TokenResponse;
    await this.setTokens(json);
    return json.access_token;
  }

  // Usado pelo fluxo de setup para a troca inicial code -> token.
  async exchangeCode(code: string, redirectUri: string): Promise<void> {
    const res = await this.o.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: this.basic(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
    });
    if (!res.ok) throw new Error(`Falha na troca de code por token (HTTP ${res.status}).`);
    await this.setTokens((await res.json()) as TokenResponse);
  }
}
