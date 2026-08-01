import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { loadConfig } from "../config";
import { TokenManager } from "../bling/tokenManager";
import { BlingClient } from "../bling/blingClient";
import { normalizaTelefoneMeta } from "../util/telefoneMeta";
import { ultimasCompras, type CompraRef } from "../util/ultimasCompras";
import { paraCsv } from "../util/csv";

interface Contato { id: number; nome?: string; numeroDocumento?: string; telefone?: string; celular?: string; }
interface Pedido { data?: string; contato?: { id?: number }; situacao?: { valor?: number }; }
interface Linha {
  id: number; nome: string; documento: string;
  telefone_original: string; celular_original: string; telefone_meta: string; tipo: string;
  qtd_compras_12m: number; data_compra_1: string; data_compra_2: string; data_compra_3: string;
}

const COLUNAS = [
  { header: "id", key: "id", width: 16 },
  { header: "nome", key: "nome", width: 40 },
  { header: "documento", key: "documento", width: 20 },
  { header: "telefone_original", key: "telefone_original", width: 20 },
  { header: "celular_original", key: "celular_original", width: 20 },
  { header: "telefone_meta", key: "telefone_meta", width: 18 },
  { header: "tipo", key: "tipo", width: 12 },
  { header: "qtd_compras_12m", key: "qtd_compras_12m", width: 16 },
  { header: "data_compra_1", key: "data_compra_1", width: 14 },
  { header: "data_compra_2", key: "data_compra_2", width: 14 },
  { header: "data_compra_3", key: "data_compra_3", width: 14 },
];

// Situação faturada/atendida: o Bling padroniza `situacao.valor === 1` como "Atendido"
// (venda efetivada), independente do id customizado da conta.
const VALOR_FATURADO = 1;

function janela12Meses() {
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - 365 * 24 * 60 * 60 * 1000);
  return { dataInicial: inicio.toISOString().slice(0, 10), dataFinal: hoje.toISOString().slice(0, 10) };
}

async function main() {
  const cfg = loadConfig();
  const tokenManager = new TokenManager({
    clientId: cfg.blingClientId, clientSecret: cfg.blingClientSecret, tokenFile: ".bling-tokens.json",
  });
  const client = new BlingClient({ tokenManager });

  console.log("Buscando contatos no Bling...");
  // Teto alto de páginas: exportação completa não pode truncar (100 * 1000 = 100k contatos).
  const { itens, truncado } = await client.getAllPages<Contato>("/contatos", {}, { limite: 100, maxPaginas: 1000 });
  console.log(`Contatos recebidos: ${itens.length}${truncado ? " (ATENÇÃO: truncado)" : ""}`);

  const periodo = janela12Meses();
  console.log(`Buscando pedidos de venda (${periodo.dataInicial} a ${periodo.dataFinal})...`);
  const { itens: pedidos, truncado: pedTrunc } = await client.getAllPages<Pedido>(
    "/pedidos/vendas", periodo, { limite: 100, maxPaginas: 1000 },
  );
  console.log(`Pedidos recebidos: ${pedidos.length}${pedTrunc ? " (ATENÇÃO: truncado)" : ""}`);

  // Só faturados (Atendido). Agrega por contato: quantidade total + 3 datas mais recentes.
  const faturados: CompraRef[] = [];
  const qtdPorContato = new Map<number, number>();
  for (const p of pedidos) {
    if (p.situacao?.valor !== VALOR_FATURADO) continue;
    const contatoId = p.contato?.id;
    if (!contatoId || !p.data) continue;
    faturados.push({ contatoId, data: p.data });
    qtdPorContato.set(contatoId, (qtdPorContato.get(contatoId) ?? 0) + 1);
  }
  const top3PorContato = ultimasCompras(faturados, 3);
  console.log(`Compras faturadas: ${faturados.length} (de ${qtdPorContato.size} contatos)`);

  const validos: Linha[] = [];
  const invalidos: Linha[] = [];
  const vistos = new Set<string>(); // dedupe por telefone_meta nos válidos

  for (const c of itens) {
    const celular = (c.celular || "").trim();
    const telefone = (c.telefone || "").trim();
    const bruto = celular || telefone; // celular tem prioridade
    if (!bruto) continue; // regra: só contatos com telefone/celular

    const n = normalizaTelefoneMeta(bruto);
    const datas = top3PorContato.get(c.id) ?? [];
    const linha: Linha = {
      id: c.id,
      nome: c.nome || "",
      documento: c.numeroDocumento || "",
      telefone_original: telefone,
      celular_original: celular,
      telefone_meta: n.numero,
      tipo: n.tipo,
      qtd_compras_12m: qtdPorContato.get(c.id) ?? 0,
      data_compra_1: datas[0] ?? "",
      data_compra_2: datas[1] ?? "",
      data_compra_3: datas[2] ?? "",
    };

    if (!n.valido) { invalidos.push(linha); continue; }
    if (vistos.has(n.numero)) continue; // duplicado
    vistos.add(n.numero);
    validos.push(linha);
  }

  const wb = new ExcelJS.Workbook();
  for (const [nomeAba, linhas] of [["Validos", validos], ["Invalidos", invalidos]] as const) {
    const ws = wb.addWorksheet(nomeAba);
    ws.columns = COLUNAS;
    ws.getRow(1).font = { bold: true };
    // Força o telefone_meta como texto para o Excel não comer zeros/virar notação científica.
    for (const l of linhas) ws.addRow({ ...l, telefone_meta: l.telefone_meta ? `${l.telefone_meta}` : "" });
    ws.getColumn("telefone_meta").numFmt = "@";
  }

  const dir = path.resolve("exports");
  await fs.mkdir(dir, { recursive: true });
  const hoje = new Date().toISOString().slice(0, 10);
  const arquivo = path.join(dir, `leads-bling-${hoje}.xlsx`);
  await wb.xlsx.writeFile(arquivo);

  // CSV: um arquivo por grupo (CSV não tem abas). UTF-8 com BOM para acentos no Excel.
  const headers = COLUNAS.map((c) => c.header);
  const paraLinhas = (ls: Linha[]) => ls.map((l) => COLUNAS.map((c) => (l as any)[c.key]));
  const csvValidos = path.join(dir, `leads-bling-validos-${hoje}.csv`);
  const csvInvalidos = path.join(dir, `leads-bling-invalidos-${hoje}.csv`);
  const BOM = String.fromCharCode(0xfeff); // Excel reconhece acentos em UTF-8 com BOM
  await fs.writeFile(csvValidos, BOM + paraCsv(headers, paraLinhas(validos)), "utf8");
  await fs.writeFile(csvInvalidos, BOM + paraCsv(headers, paraLinhas(invalidos)), "utf8");

  console.log(`\n✅ Arquivos gerados em ${dir}:`);
  console.log(`   ${path.basename(arquivo)}  (XLSX, abas Validos/Invalidos)`);
  console.log(`   ${path.basename(csvValidos)}  (${validos.length} válidos, dedupe aplicado)`);
  console.log(`   ${path.basename(csvInvalidos)}  (${invalidos.length} inválidos)`);
}

main().catch((e) => { console.error("Falha na exportação:", e); process.exit(1); });
