import "dotenv/config";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { loadConfig } from "../config";
import { TokenManager } from "./tokenManager";

const cfg = loadConfig();
const state = randomBytes(8).toString("hex");
const url = new URL(cfg.blingRedirectUri);
// Porta em que o servidor de setup escuta. Se o redirect for uma URL https sem porta
// explícita (ex.: via ngrok), `url.port` fica vazio — então caímos na PORT do .env (3000).
const listenPort = Number(url.port) || cfg.port;
const tm = new TokenManager({ clientId: cfg.blingClientId, clientSecret: cfg.blingClientSecret, tokenFile: ".bling-tokens.json" });

// URL de authorize confirmada via documentação oficial e exemplos da comunidade:
// https://developer.bling.com.br/bling-api e https://github.com/vcsil/bling_api_v3_oauth
// Host: www.bling.com.br (distinto do token endpoint que usa api.bling.com.br)
const authorizeUrl =
  `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code` +
  `&client_id=${encodeURIComponent(cfg.blingClientId)}&state=${state}` +
  `&redirect_uri=${encodeURIComponent(cfg.blingRedirectUri)}`;

console.log("\n1) Abra esta URL no navegador e autorize o app:\n\n" + authorizeUrl + "\n");

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url!, `http://localhost:${listenPort}`);
  if (reqUrl.pathname !== url.pathname) { res.writeHead(404).end(); return; }
  const code = reqUrl.searchParams.get("code");
  const gotState = reqUrl.searchParams.get("state");
  if (!code || gotState !== state) { res.writeHead(400).end("code/state inválido"); return; }
  try {
    await tm.exchangeCode(code, cfg.blingRedirectUri);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end("<h2>Bling conectado! Pode fechar esta aba.</h2>");
    console.log("\n✅ Token salvo em .bling-tokens.json\n");
  } catch (e) {
    res.writeHead(500).end(String(e));
    console.error(e);
  } finally {
    setTimeout(() => server.close(() => process.exit(0)), 500);
  }
});
server.listen(listenPort, () => console.log(`2) Aguardando callback em ${cfg.blingRedirectUri} (porta ${listenPort}) ...`));
