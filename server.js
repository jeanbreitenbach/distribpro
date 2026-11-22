/*
 * DistribPro — servidor
 * Node.js >= 22.5, sem dependências externas (usa node:sqlite embutido).
 *   node server.js            → http://localhost:3000
 * Variáveis: PORT, DB_FILE, NFE_PROVEDOR, FOCUS_TOKEN, FOCUS_AMBIENTE
 */
process.removeAllListeners('warning'); // silencia aviso "SQLite is experimental"
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const R = require('./lib/regras');
const NFE = require('./lib/nfe');
const { seedDemo, baseVazia } = require('./lib/seed');

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'distribpro.db');
const COLS = ['produtos', 'clientes', 'vendedores', 'pedidos', 'movimentos', 'titulos', 'usuarios', 'condicoes', 'tabelas', 'fornecedores', 'pagar', 'compras', 'bancos', 'extrato'];
const uid = () => crypto.randomBytes(8).toString('hex');

/* ================= Persistência ================= */
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const sql = new DatabaseSync(DB_FILE);
sql.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (col, id));
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
const qUpsert = sql.prepare('INSERT INTO docs (col,id,data) VALUES (?,?,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data');
const qDelete = sql.prepare('DELETE FROM docs WHERE col=? AND id=?');
const qMeta = sql.prepare('INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');

let db; const cache = new Map(); // "col\0id" -> json já gravado
function carregar() {
  cache.clear();
  const meta = Object.fromEntries(sql.prepare('SELECT key,value FROM meta').all().map(r => [r.key, JSON.parse(r.value)]));
  if (!meta.empresa) return false;
  db = { empresa: meta.empresa, seq: meta.seq };
  COLS.forEach(c => db[c] = []);
  for (const r of sql.prepare('SELECT col,id,data FROM docs').all()) {
    if (!db[r.col]) continue; db[r.col].push(JSON.parse(r.data)); cache.set(r.col + '\0' + r.id, r.data);
  }
  db.movimentos.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return true;
}
/** Grava apenas os documentos alterados, numa transação. */
function persistir() {
  sql.exec('BEGIN');
  try {
    const vivos = new Set();
    for (const c of COLS) for (const o of db[c]) {
      const k = c + '\0' + o.id, j = JSON.stringify(o); vivos.add(k);
      if (cache.get(k) !== j) { qUpsert.run(c, o.id, j); cache.set(k, j); }
    }
    for (const k of [...cache.keys()]) if (!vivos.has(k)) { const [c, id] = k.split('\0'); qDelete.run(c, id); cache.delete(k); }
    qMeta.run('empresa', JSON.stringify(db.empresa)); qMeta.run('seq', JSON.stringify(db.seq));
    sql.exec('COMMIT');
  } catch (e) { sql.exec('ROLLBACK'); throw e; }
}
function substituirTudo(novo) {
  db = novo; COLS.forEach(c => db[c] = db[c] || []); persistir();
}

/* ================= Autenticação ================= */
function hashSenha(s) { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(String(s), salt, 32).toString('hex'); }
function conferirSenha(s, h) {
  if (!h || !h.includes(':')) return false; const [salt, hex] = h.split(':');
  const a = crypto.scryptSync(String(s), salt, 32), b = Buffer.from(hex, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b);
}
let SECRET = (sql.prepare("SELECT value FROM meta WHERE key='secret'").get() || {}).value;
if (!SECRET) { SECRET = JSON.stringify(crypto.randomBytes(32).toString('hex')); qMeta.run('secret', SECRET); }
const b64 = s => Buffer.from(s).toString('base64url');
function gerarToken(u) {
  const p = b64(JSON.stringify({ uid: u.id, exp: Date.now() + 7 * 864e5, v: u.senha.slice(0, 8) }));
  return p + '.' + crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
}
function lerToken(t) {
  if (!t) return null; const [p, s] = t.split('.'); if (!p || !s) return null;
  const ok = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  if (s.length !== ok.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(ok))) return null;
  const d = JSON.parse(Buffer.from(p, 'base64url').toString()); if (d.exp < Date.now()) return null;
  const u = R.find(db, 'usuarios', d.uid);
  if (!u || u.ativo === 'Não' || u.senha.slice(0, 8) !== d.v) return null; // trocar a senha invalida tokens antigos
  return u;
}
const tentativas = new Map();
// Atrás de proxy (Render, Nginx...) o IP real vem em X-Forwarded-For
const ipCliente = req => (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;

/* ================= Visão por perfil ================= */
const semCusto = p => { const { custo, ...r } = p; return r; };
function visao(u) {
  const me = { id: u.id, nome: u.nome, email: u.email, papel: u.papel, vendedorId: u.vendedorId, clienteId: u.clienteId };
  const base = { me, empresa: db.empresa, condicoes: db.condicoes, nfeProvedor: NFE.provedor() };
  if (u.papel === 'admin') {
    return { ...base, ...Object.fromEntries(COLS.map(c => [c, db[c]])), movimentos: db.movimentos.slice(0, 2000),
      usuarios: db.usuarios.map(({ senha, ...x }) => x) };
  }
  if (u.papel === 'vendedor') {
    const clientes = db.clientes.filter(c => c.vendedorId === u.vendedorId); const ids = new Set(clientes.map(c => c.id));
    return { ...base, clientes, produtos: db.produtos.map(semCusto), tabelas: db.tabelas,
      vendedores: db.vendedores.filter(v => v.id === u.vendedorId),
      pedidos: db.pedidos.filter(p => p.vendedorId === u.vendedorId || ids.has(p.clienteId)),
      titulos: db.titulos.filter(t => ids.has(t.clienteId)), movimentos: [], usuarios: [], fornecedores: [], pagar: [], compras: [], bancos: [], extrato: [] };
  }
  // cliente (portal B2B)
  const cli = R.find(db, 'clientes', u.clienteId);
  const v = cli && R.find(db, 'vendedores', cli.vendedorId);
  return { ...base, clientes: cli ? [cli] : [], produtos: db.produtos.filter(p => p.ativo !== 'Não').map(semCusto),
    tabelas: db.tabelas.filter(t => cli && t.id === cli.tabelaId),
    vendedores: v ? [{ id: v.id, nome: v.nome, telefone: v.telefone, email: v.email }] : [],
    pedidos: db.pedidos.filter(p => p.clienteId === u.clienteId), titulos: db.titulos.filter(t => t.clienteId === u.clienteId), movimentos: [], usuarios: [], fornecedores: [], pagar: [], compras: [], bancos: [], extrato: [] };
}

/* ================= Cadastros (campos permitidos) ================= */
const T = 'text', N = 'number';
const CAMPOS = {
  produtos: { codigo: T, nome: T, categoria: T, marca: T, unidade: T, ean: T, ncm: T, custo: N, preco: N, estoque: N, estoqueMin: N, ativo: T },
  clientes: { razao: T, fantasia: T, cnpj: T, ie: T, telefone: T, email: T, logradouro: T, numero: T, bairro: T, cidade: T, uf: T, cep: T, vendedorId: T, tabelaId: T, condicaoId: T, limite: N, ativo: T },
  vendedores: { nome: T, email: T, telefone: T, comissao: N, meta: N, ativo: T },
  tabelas: { nome: T, ajuste: N },
  bancos: { nome: T, banco: T, agencia: T, conta: T, saldoInicial: N, dataSaldo: T, ativo: T },
  fornecedores: { razao: T, fantasia: T, cnpj: T, ie: T, contato: T, telefone: T, email: T, cidade: T, uf: T, categoria: T, prazo: T, pix: T, banco: T, obs: T, ativo: T },
  condicoes: { nome: T, parcelas: T },
  usuarios: { nome: T, email: T, papel: T, vendedorId: T, clienteId: T, ativo: T },
};
const OBRIG = { produtos: 'nome', clientes: 'razao', vendedores: 'nome', tabelas: 'nome', bancos: 'nome', fornecedores: 'razao', condicoes: 'nome', usuarios: 'email' };

class Erro extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const exigir = (cond, msg = 'Sem permissão', st = 403) => { if (!cond) throw new Erro(st, msg); };

function salvarCadastro(u, col, body) {
  const campos = CAMPOS[col]; exigir(campos, 'Coleção inválida', 404);
  const ehVendCli = u.papel === 'vendedor' && col === 'clientes';
  exigir(u.papel === 'admin' || ehVendCli);
  let o = body.id ? R.find(db, col, body.id) : null;
  if (body.id) exigir(o, 'Registro não encontrado', 404);
  if (ehVendCli && o) exigir(o.vendedorId === u.vendedorId);
  const novo = { ...(o || {}), id: o ? o.id : uid() };
  for (const [k, t] of Object.entries(campos)) if (k in body) novo[k] = t === N ? (Number(String(body[k]).replace(',', '.')) || 0) : String(body[k] ?? '').trim();
  exigir(novo[OBRIG[col]], 'Preencha os campos obrigatórios', 400);
  if (ehVendCli) novo.vendedorId = u.vendedorId;
  if (col === 'produtos' && o && novo.estoque !== o.estoque) { // ajuste de estoque pelo cadastro gera movimentação
    const q = novo.estoque; novo.estoque = o.estoque; Object.assign(o, novo);
    R.movimentar(db, o.id, 'Ajuste', q, 'Ajuste pelo cadastro (' + u.nome + ')', R.hoje(), uid);
    return;
  }
  if (col === 'usuarios') {
    novo.email = novo.email.toLowerCase();
    exigir(['admin', 'vendedor', 'cliente'].includes(novo.papel), 'Perfil inválido', 400);
    exigir(!db.usuarios.some(x => x.email === novo.email && x.id !== novo.id), 'E-mail já cadastrado', 400);
    if (novo.papel === 'vendedor') exigir(R.find(db, 'vendedores', novo.vendedorId), 'Selecione o vendedor vinculado', 400);
    if (novo.papel === 'cliente') exigir(R.find(db, 'clientes', novo.clienteId), 'Selecione o cliente vinculado', 400);
    if (body.senha) { exigir(String(body.senha).length >= 6, 'A senha deve ter pelo menos 6 caracteres', 400); novo.senha = hashSenha(body.senha); }
    exigir(novo.senha, 'Informe uma senha', 400);
    if (o && o.id === u.id) exigir(novo.papel === 'admin' && novo.ativo !== 'Não', 'Você não pode remover seu próprio acesso de administrador', 400);
  }
  if (o) Object.assign(o, novo); else db[col].push(novo);
}
function excluirCadastro(u, col, id) {
  exigir(u.papel === 'admin'); exigir(CAMPOS[col], 'Coleção inválida', 404);
  const em = {
    bancos: () => db.extrato.some(e => e.bancoId === id),
    fornecedores: () => db.compras.some(c => c.fornecedorId === id) || db.pagar.some(t => t.fornecedorId === id),
    vendedores: () => db.clientes.some(c => c.vendedorId === id) || db.pedidos.some(p => p.vendedorId === id) || db.usuarios.some(x => x.vendedorId === id),
    clientes: () => db.pedidos.some(p => p.clienteId === id) || db.usuarios.some(x => x.clienteId === id),
    produtos: () => db.pedidos.some(p => p.itens.some(i => i.produtoId === id)),
    tabelas: () => db.clientes.some(c => c.tabelaId === id),
    condicoes: () => db.clientes.some(c => c.condicaoId === id) || db.pedidos.some(p => p.condicaoId === id),
    usuarios: () => id === u.id,
  }[col];
  exigir(!em(), 'Registro em uso — não pode ser excluído. Marque-o como inativo.', 400);
  db[col] = db[col].filter(x => x.id !== id);
}

/* ================= Pedidos ================= */
function podeVerPedido(u, p) {
  if (u.papel === 'admin') return true;
  if (u.papel === 'vendedor') { const c = R.find(db, 'clientes', p.clienteId); return p.vendedorId === u.vendedorId || (c && c.vendedorId === u.vendedorId); }
  return p.clienteId === u.clienteId;
}
function salvarPedido(u, { pedido: inp, aprovar }) {
  exigir(inp && Array.isArray(inp.itens), 'Dados inválidos', 400);
  const ant = inp.id ? R.find(db, 'pedidos', inp.id) : null;
  if (inp.id) {
    exigir(ant, 'Pedido não encontrado', 404); exigir(podeVerPedido(u, ant));
    exigir(R.ABERTOS.includes(ant.status), 'Só é possível editar pedidos em Orçamento, Aprovado ou Em separação.', 400);
    if (u.papel === 'cliente') exigir(ant.status === 'Orçamento', 'Este pedido já foi aprovado pela distribuidora e não pode mais ser alterado.', 400);
  }
  const cli = R.find(db, 'clientes', u.papel === 'cliente' ? u.clienteId : inp.clienteId);
  exigir(cli, 'Selecione o cliente', 400);
  if (u.papel === 'vendedor') exigir(cli.vendedorId === u.vendedorId, 'Cliente fora da sua carteira');
  const itens = [];
  for (const i of inp.itens) {
    const p = R.find(db, 'produtos', i.produtoId); const qtd = Number(i.qtd);
    if (!p || !(qtd > 0)) continue;
    itens.push(u.papel === 'cliente' ? { produtoId: p.id, qtd, preco: R.precoCliente(db, p, cli), desc: 0 }
      : { produtoId: p.id, qtd, preco: R.r2(Math.max(0, Number(i.preco) || 0)), desc: Math.min(100, Math.max(0, Number(i.desc) || 0)) });
  }
  exigir(itens.length, 'Adicione pelo menos um item', 400);
  const ped = {
    ...(ant || { id: uid(), numero: ++db.seq.pedido, status: 'Orçamento', criadoPor: u.nome, criadoEm: new Date().toISOString(),
      origem: u.papel === 'cliente' ? 'Portal B2B' : u.papel === 'vendedor' ? 'Vendedor' : 'Escritório' }),
    clienteId: cli.id, itens, obs: String(inp.obs || '').slice(0, 2000),
    data: /^\d{4}-\d{2}-\d{2}$/.test(inp.data) ? inp.data : R.hoje(), entrega: /^\d{4}-\d{2}-\d{2}$/.test(inp.entrega) ? inp.entrega : '',
  };
  if (u.papel === 'cliente') Object.assign(ped, { vendedorId: cli.vendedorId, condicaoId: cli.condicaoId, frete: 0, descontoGeral: 0, data: ant ? ant.data : R.hoje() });
  else {
    ped.vendedorId = u.papel === 'vendedor' ? u.vendedorId : inp.vendedorId;
    ped.condicaoId = inp.condicaoId; ped.frete = Math.max(0, Number(inp.frete) || 0); ped.descontoGeral = Math.min(100, Math.max(0, Number(inp.descontoGeral) || 0));
    exigir(R.find(db, 'vendedores', ped.vendedorId), 'Selecione o vendedor', 400);
    exigir(R.find(db, 'condicoes', ped.condicaoId), 'Selecione a condição de pagamento', 400);
  }
  if (ant) Object.assign(ant, ped); else db.pedidos.push(ped);
  if (aprovar && u.papel !== 'cliente' && ped.status === 'Orçamento') R.mudarStatus(db, ant || ped, 'Aprovado', uid);
  return (ant || ped).id;
}
function statusPedido(u, id, { status, forcar }) {
  const p = R.find(db, 'pedidos', id); exigir(p, 'Pedido não encontrado', 404); exigir(podeVerPedido(u, p));
  exigir(R.STATUS.includes(status), 'Status inválido', 400);
  if (u.papel === 'vendedor') exigir(['Orçamento', 'Aprovado'].includes(p.status) && ['Orçamento', 'Aprovado', 'Cancelado'].includes(status),
    'Vendedores só podem aprovar, voltar para orçamento ou cancelar pedidos ainda não separados.');
  if (u.papel === 'cliente') exigir(p.status === 'Orçamento' && status === 'Cancelado', 'Você só pode cancelar pedidos ainda em orçamento.');
  if (p.nfe && p.nfe.status === 'autorizada' && !p.nfe.simulada && !R.BAIXA.includes(status))
    throw new Erro(400, 'Este pedido tem NF-e autorizada. Cancele a nota na SEFAZ antes de estornar o pedido.');
  if (!R.BAIXA.includes(p.status) && R.BAIXA.includes(status) && !forcar) {
    const av = R.avisosFaturamento(db, p); if (av.length) throw new Erro(409, av.join('\n'), { avisos: av });
  }
  R.mudarStatus(db, p, status, uid);
  p.historico = [...(p.historico || []), { em: new Date().toISOString(), por: u.nome, status }];
}

/* ================= HTTP ================= */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
function enviar(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(obj));
}
function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let n = 0; const partes = [];
    req.on('data', c => { n += c.length; if (n > 50e6) { falha(new Erro(413, 'Requisição muito grande')); req.destroy(); } else partes.push(c); });
    req.on('end', () => { try { ok(partes.length ? JSON.parse(Buffer.concat(partes).toString()) : {}); } catch { falha(new Erro(400, 'JSON inválido')); } });
  });
}
function estatico(req, res) {
  let f = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (f === '/regras.js') f = path.join(__dirname, 'lib', 'regras.js');
  else { if (f === '/' || !path.extname(f)) f = '/index.html'; f = path.join(__dirname, 'public', path.normalize(f)); if (!f.startsWith(path.join(__dirname, 'public'))) return enviar(res, 404, {}); }
  fs.readFile(f, (e, buf) => {
    if (e) return enviar(res, 404, { erro: 'Não encontrado' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(buf);
  });
}

const rotas = [];
const rota = (m, p, fn, opts = {}) => rotas.push({ m, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, ...opts });

rota('POST', '/api/login', (req, b) => {
  const ip = ipCliente(req); const t = tentativas.get(ip) || { n: 0, ate: 0 };
  if (t.ate > Date.now()) throw new Erro(429, 'Muitas tentativas. Aguarde alguns minutos.');
  const u = db.usuarios.find(x => x.email === String(b.email || '').trim().toLowerCase());
  if (!u || u.ativo === 'Não' || !conferirSenha(b.senha || '', u.senha)) {
    t.n++; if (t.n >= 8) { t.ate = Date.now() + 5 * 60e3; t.n = 0; } tentativas.set(ip, t);
    throw new Erro(401, 'E-mail ou senha incorretos');
  }
  tentativas.delete(ip); u.ultimoAcesso = new Date().toISOString();
  return { token: gerarToken(u), data: visao(u) };
}, { publica: true, grava: true });

rota('GET', '/api/health', () => ({ status: 'ok' }), { publica: true });
rota('GET', '/api/data', () => null);
rota('POST', '/api/senha', (req, b, u) => {
  exigir(conferirSenha(b.atual || '', u.senha), 'Senha atual incorreta', 400);
  exigir(String(b.nova || '').length >= 6, 'A nova senha deve ter pelo menos 6 caracteres', 400);
  u.senha = hashSenha(b.nova); return { token: gerarToken(u) };
}, { grava: true });
rota('PUT', '/api/crud/:col', (req, b, u, p) => salvarCadastro(u, p.col, b), { grava: true });
rota('DELETE', '/api/crud/:col/:id', (req, b, u, p) => excluirCadastro(u, p.col, p.id), { grava: true });
rota('POST', '/api/pedidos', (req, b, u) => ({ id: salvarPedido(u, b) }), { grava: true });
rota('POST', '/api/pedidos/:id/status', (req, b, u, p) => statusPedido(u, p.id, b), { grava: true });
rota('DELETE', '/api/pedidos/:id', (req, b, u, p) => {
  exigir(u.papel === 'admin'); const ped = R.find(db, 'pedidos', p.id); exigir(ped, 'Pedido não encontrado', 404);
  exigir(!(ped.nfe && ped.nfe.status === 'autorizada' && !ped.nfe.simulada), 'Pedido com NF-e autorizada não pode ser excluído.', 400);
  R.mudarStatus(db, ped, 'Cancelado', uid);
  db.pedidos = db.pedidos.filter(x => x.id !== p.id); db.titulos = db.titulos.filter(t => t.pedidoId !== p.id);
}, { grava: true });
rota('POST', '/api/pedidos/:id/nfe', async (req, b, u, p) => {
  exigir(u.papel === 'admin'); const ped = R.find(db, 'pedidos', p.id); exigir(ped, 'Pedido não encontrado', 404);
  try { return { nfe: await NFE.emitir(db, ped) }; } catch (e) { throw new Erro(400, e.message); }
}, { grava: true });
rota('POST', '/api/estoque', (req, b, u) => {
  exigir(u.papel === 'admin'); exigir(R.find(db, 'produtos', b.produtoId), 'Produto inválido', 400);
  exigir(['Entrada', 'Saída', 'Ajuste'].includes(b.tipo), 'Tipo inválido', 400);
  R.movimentar(db, b.produtoId, b.tipo, Math.abs(Number(b.qtd) || 0), String(b.ref || 'Lançamento manual') + ' (' + u.nome + ')', R.hoje(), uid);
}, { grava: true });
rota('POST', '/api/titulos/:id', (req, b, u, p) => {
  exigir(u.papel === 'admin'); const t = db.titulos.find(x => x.id === p.id); exigir(t, 'Título não encontrado', 404);
  t.pago = !!b.pago; t.dataPagamento = t.pago ? (b.data || R.hoje()) : ''; t.baixadoPor = t.pago ? u.nome : '';
}, { grava: true });
/* ---- Contas a pagar ---- */
const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
rota('PUT', '/api/pagar', (req, b, u) => {
  exigir(u.papel === 'admin');
  const desc = String(b.descricao || '').trim(); exigir(desc, 'Informe a descrição', 400);
  exigir(dataOk(b.vencimento), 'Informe o vencimento', 400);
  if (b.fornecedorId) exigir(R.find(db, 'fornecedores', b.fornecedorId), 'Fornecedor inválido', 400);
  const valor = R.r2(Number(String(b.valor).replace(',', '.')));
  exigir(valor > 0, 'Informe um valor maior que zero', 400);
  const base = { fornecedorId: b.fornecedorId || '', descricao: desc.slice(0, 200), categoria: R.CATEGORIAS_PAGAR.includes(b.categoria) ? b.categoria : 'Outras despesas',
    documento: String(b.documento || '').slice(0, 60), obs: String(b.obs || '').slice(0, 1000), emissao: dataOk(b.emissao) ? b.emissao : R.hoje() };
  if (b.id) {
    const t = db.pagar.find(x => x.id === b.id); exigir(t, 'Conta não encontrada', 404);
    exigir(!t.pago, 'Estorne o pagamento antes de editar.', 400);
    Object.assign(t, base, { vencimento: b.vencimento, valor });
    return;
  }
  // nova conta, com parcelamento ou repetição mensal
  const n = Math.min(120, Math.max(1, parseInt(b.parcelas) || 1)); const intervalo = Math.max(1, parseInt(b.intervalo) || 30);
  const repetir = b.modo === 'repetir'; const vals = repetir ? Array(n).fill(valor) : R.dividir(valor, n);
  const grupo = uid();
  for (let k = 0; k < n; k++) {
    let venc = b.vencimento;
    if (k) { if (intervalo === 30) { const d = new Date(b.vencimento + 'T12:00:00'); const dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + k); d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); venc = d.toISOString().slice(0, 10); } else venc = R.addDays(b.vencimento, intervalo * k); }
    db.pagar.push({ id: uid(), grupo, ...base, parcela: n > 1 ? `${k + 1}/${n}` : '', vencimento: venc, valor: vals[k], pago: false, dataPagamento: '', valorPago: 0, criadoPor: u.nome });
  }
}, { grava: true });
rota('POST', '/api/pagar/:id/baixa', (req, b, u, p) => {
  exigir(u.papel === 'admin'); const t = db.pagar.find(x => x.id === p.id); exigir(t, 'Conta não encontrada', 404);
  t.pago = !!b.pago;
  if (t.pago) { t.dataPagamento = dataOk(b.data) ? b.data : R.hoje(); const vp = Number(b.valorPago); t.valorPago = R.r2(vp > 0 ? vp : t.valor); t.formaPagamento = String(b.forma || '').slice(0, 40); t.baixadoPor = u.nome; }
  else Object.assign(t, { dataPagamento: '', valorPago: 0, formaPagamento: '', baixadoPor: '' });
}, { grava: true });
rota('DELETE', '/api/pagar/:id', (req, b, u, p) => {
  exigir(u.papel === 'admin'); const t = db.pagar.find(x => x.id === p.id); exigir(t, 'Conta não encontrada', 404);
  exigir(!t.pago, 'Estorne o pagamento antes de excluir.', 400);
  exigir(!t.compraId || R.find(db, 'compras', t.compraId)?.status === 'Cancelada', 'Esta conta veio de uma NF de compra. Cancele a compra para removê-la.', 400);
  db.pagar = db.pagar.filter(x => x.id !== p.id);
}, { grava: true });

/* ---- Compras (entrada de NF) ---- */
const so = v => String(v || '').replace(/\D/g, '');
const r4 = v => Math.round((Number(v) || 0) * 1e4) / 1e4;
const txt = (v, n = 200) => String(v ?? '').trim().slice(0, n);
rota('POST', '/api/compras', (req, b, u) => {
  exigir(u.papel === 'admin');
  // ---- 1. valida tudo antes de alterar qualquer dado ----
  let forn = R.find(db, 'fornecedores', b.fornecedorId);
  const nf = txt(b.nf, 30), chave = so(b.chave);
  if (!forn && b.novoFornecedor) {
    const f = b.novoFornecedor; exigir(txt(f.razao), 'Informe a razão social do fornecedor', 400);
    if (so(f.cnpj)) exigir(!db.fornecedores.some(x => so(x.cnpj) === so(f.cnpj)), 'Já existe um fornecedor com este CNPJ', 400);
  } else exigir(forn, 'Selecione o fornecedor', 400);
  if (chave) {
    exigir(chave.length === 44, 'Chave de acesso inválida', 400);
    const dup = db.compras.find(c => c.chave === chave && c.status !== 'Cancelada');
    exigir(!dup, `Esta NF-e já foi lançada (entrada #${dup && dup.numero}).`, 400);
  }
  if (nf && forn) exigir(!db.compras.some(c => c.nf === nf && c.fornecedorId === forn.id && c.status !== 'Cancelada'), `A NF ${nf} deste fornecedor já foi lançada.`, 400);
  const brutos = Array.isArray(b.itens) ? b.itens : [];
  const eans = new Set();
  for (const i of brutos) {
    exigir(Number(i.qtd) > 0 && Number(i.custo) >= 0, 'Quantidade ou custo inválido em algum item', 400);
    if (i.novoProduto) {
      exigir(txt(i.novoProduto.nome), 'Informe o nome do produto novo', 400);
      const ean = so(i.novoProduto.ean);
      if (ean) { exigir(!db.produtos.some(p => p.ean === ean) && !eans.has(ean), `Já existe um produto com o EAN ${ean}. Vincule ao produto existente.`, 400); eans.add(ean); }
    } else exigir(R.find(db, 'produtos', i.produtoId), 'Há itens sem produto vinculado', 400);
  }
  exigir(brutos.length, 'Adicione pelo menos um item', 400);
  const dups = (Array.isArray(b.duplicatas) ? b.duplicatas : []).map(d => ({ numero: txt(d.numero, 20), vencimento: d.vencimento, valor: R.r2(d.valor) }));
  for (const d of dups) exigir(dataOk(d.vencimento) && d.valor > 0, 'Duplicata com vencimento ou valor inválido', 400);

  // ---- 2. aplica ----
  if (!forn) {
    const f = b.novoFornecedor;
    forn = { id: uid(), razao: txt(f.razao), fantasia: txt(f.fantasia) || txt(f.razao), cnpj: txt(f.cnpj, 20), ie: txt(f.ie, 20), telefone: txt(f.telefone, 30), email: txt(f.email, 100),
      cidade: txt(f.cidade, 60), uf: txt(f.uf, 2), categoria: txt(f.categoria, 60), contato: '', prazo: '', pix: '', banco: '', obs: 'Cadastrado pela importação de XML', ativo: 'Sim' };
    db.fornecedores.push(forn);
  }
  let prox = Math.max(1000, ...db.produtos.map(p => parseInt(p.codigo) || 0));
  const itens = brutos.map(i => {
    let pid = i.produtoId;
    if (i.novoProduto) {
      const n = i.novoProduto;
      const p = { id: uid(), codigo: String(++prox), nome: txt(n.nome), categoria: txt(n.categoria, 60) || forn.categoria || '', marca: '', unidade: txt(n.unidade, 6) || 'UN',
        ean: so(n.ean), ncm: so(n.ncm), custo: R.r2(i.custo), preco: R.r2(Math.max(0, Number(n.preco) || 0)), estoque: 0, estoqueMin: Math.max(0, Number(n.estoqueMin) || 0), ativo: 'Sim' };
      db.produtos.push(p); pid = p.id;
    }
    const item = { produtoId: pid, qtd: Number(i.qtd), custo: r4(i.custo) };
    if (i.cProd) {
      Object.assign(item, { cProd: txt(i.cProd, 60), xProd: txt(i.xProd), qtdNF: Number(i.qtdNF) || 0, unNF: txt(i.unNF, 6), fator: Number(i.fator) || 1 });
      forn.vinculos = forn.vinculos || {}; forn.vinculos[item.cProd] = { produtoId: pid, fator: item.fator }; // memoriza para as próximas notas
    }
    return item;
  });
  const c = { id: uid(), numero: (db.seq.compra = (db.seq.compra || 0) + 1), fornecedorId: forn.id, nf, serie: txt(b.serie, 3), chave, emissao: dataOk(b.emissao) ? b.emissao : '',
    data: dataOk(b.data) ? b.data : R.hoje(), itens, frete: R.r2(Math.max(0, Number(b.frete) || 0)), outras: R.r2(Math.max(0, Number(b.outras) || 0)),
    parcelas: R.diasParcelas(b.parcelas).join(','), duplicatas: dups, totalNF: R.r2(b.totalNF) || undefined, origem: chave ? 'XML' : 'Manual',
    atualizarCusto: b.atualizarCusto !== false, obs: txt(b.obs, 1000), criadoPor: u.nome, criadoEm: new Date().toISOString() };
  db.compras.push(c); R.lancarCompra(db, c, uid);
  return { id: c.id };
}, { grava: true });
rota('POST', '/api/compras/:id/cancelar', (req, b, u, p) => {
  exigir(u.papel === 'admin'); const c = R.find(db, 'compras', p.id); exigir(c, 'Compra não encontrada', 404);
  exigir(c.status !== 'Cancelada', 'Compra já cancelada', 400);
  R.cancelarCompra(db, c, uid);
}, { grava: true });

/* ---- Bancos e conciliação ---- */
const CATEGORIAS_ENTRADA = ['Rendimento de aplicação', 'Transferência entre contas', 'Aporte de sócio', 'Empréstimo / financiamento', 'Estorno / devolução', 'Outras receitas'];
rota('POST', '/api/extrato/importar', (req, b, u) => {
  exigir(u.papel === 'admin'); const banco = R.find(db, 'bancos', b.bancoId); exigir(banco, 'Selecione a conta bancária', 400);
  const lista = Array.isArray(b.lancamentos) ? b.lancamentos : [];
  exigir(lista.length, 'O extrato não tem lançamentos', 400);
  exigir(lista.length <= 5000, 'Extrato muito grande (máx. 5000 lançamentos por arquivo)', 400);
  const chaveL = l => l.fitid ? 'F' + l.fitid : `D${l.data}|${l.valor}|${l.descricao}`;
  const existentes = new Set(db.extrato.filter(e => e.bancoId === banco.id).map(chaveL));
  let novos = 0, duplicados = 0, ignorados = 0;
  for (const x of lista) {
    const l = { data: x.data, valor: R.r2(x.valor), descricao: txt(x.descricao, 200), fitid: txt(x.fitid, 80), documento: txt(x.documento, 40) };
    if (!dataOk(l.data) || !l.valor) { ignorados++; continue; }
    const k = chaveL(l); if (existentes.has(k)) { duplicados++; continue; }
    existentes.add(k); novos++;
    db.extrato.push({ id: uid(), bancoId: banco.id, ...l, conciliado: null, importadoEm: new Date().toISOString(), importadoPor: u.nome });
  }
  return { importacao: { novos, duplicados, ignorados } };
}, { grava: true });
rota('POST', '/api/extrato/:id/conciliar', (req, b, u, p) => {
  exigir(u.papel === 'admin'); const e = db.extrato.find(x => x.id === p.id); exigir(e, 'Lançamento não encontrado', 404);
  exigir(!e.conciliado, 'Lançamento já conciliado. Desfaça antes de conciliar de novo.', 400);
  const info = { tipo: b.tipo, ids: [], baixou: [], criou: [], por: u.nome, em: new Date().toISOString() };
  if (b.tipo === 'receber' || b.tipo === 'pagar') {
    const col = b.tipo === 'receber' ? 'titulos' : 'pagar';
    exigir(b.tipo === 'receber' ? e.valor > 0 : e.valor < 0, b.tipo === 'receber' ? 'Só créditos podem ser conciliados com contas a receber.' : 'Só débitos podem ser conciliados com contas a pagar.', 400);
    const ids = [...new Set(Array.isArray(b.ids) ? b.ids : [])]; exigir(ids.length, 'Selecione pelo menos um título', 400);
    const ts = ids.map(id => db[col].find(t => t.id === id)); exigir(ts.every(Boolean), 'Título não encontrado', 400);
    exigir(!db.extrato.some(x => x.conciliado && x.conciliado.tipo === b.tipo && x.conciliado.ids.some(i => ids.includes(i))), 'Algum dos títulos já está conciliado com outro lançamento.', 400);
    const soma = ts.reduce((s, t) => s + (t.pago ? (t.valorPago || t.valor) : t.valor), 0);
    const dif = R.r2(Math.abs(e.valor) - soma);
    if (Math.abs(dif) > 0.05 && !b.forcar) throw new Erro(409, `O lançamento (${Math.abs(e.valor).toFixed(2)}) difere da soma dos títulos (${soma.toFixed(2)}) em ${dif.toFixed(2)}.`, { diferenca: dif });
    ts.forEach(t => {
      if (t.pago) return; // já baixado manualmente: só vincula
      t.pago = true; t.dataPagamento = e.data; t.bancoId = e.bancoId; t.baixadoPor = u.nome + ' (conciliação)';
      const vp = ts.length === 1 ? Math.abs(e.valor) : t.valor;
      if (col === 'pagar') { t.valorPago = R.r2(vp); t.formaPagamento = 'Débito em conta'; } else t.valorRecebido = R.r2(vp);
      info.baixou.push(t.id);
    });
    info.ids = ids; info.diferenca = dif;
  } else if (b.tipo === 'avulso') {
    const cats = e.valor < 0 ? R.CATEGORIAS_PAGAR : CATEGORIAS_ENTRADA;
    exigir(cats.includes(b.categoria), 'Selecione a categoria', 400);
    info.categoria = b.categoria; info.descricao = txt(b.descricao, 200) || e.descricao;
    if (e.valor < 0) { // despesa avulsa entra no contas a pagar já paga (aparece nos relatórios de despesa)
      const t = { id: uid(), fornecedorId: R.find(db, 'fornecedores', b.fornecedorId) ? b.fornecedorId : '', descricao: info.descricao, categoria: b.categoria, documento: e.documento, parcela: '',
        emissao: e.data, vencimento: e.data, valor: Math.abs(e.valor), pago: true, dataPagamento: e.data, valorPago: Math.abs(e.valor), formaPagamento: 'Débito em conta', bancoId: e.bancoId,
        baixadoPor: u.nome + ' (conciliação)', origem: 'extrato', obs: '' };
      db.pagar.push(t); info.criou.push(t.id);
    }
  } else throw new Erro(400, 'Tipo de conciliação inválido');
  e.conciliado = info;
}, { grava: true });
rota('POST', '/api/extrato/:id/desfazer', (req, b, u, p) => {
  exigir(u.papel === 'admin'); const e = db.extrato.find(x => x.id === p.id); exigir(e, 'Lançamento não encontrado', 404);
  const c = e.conciliado; exigir(c, 'Lançamento não está conciliado', 400);
  const col = c.tipo === 'receber' ? 'titulos' : 'pagar';
  (c.baixou || []).forEach(id => { const t = db[col].find(x => x.id === id); if (t) Object.assign(t, { pago: false, dataPagamento: '', baixadoPor: '', bancoId: '', ...(col === 'pagar' ? { valorPago: 0, formaPagamento: '' } : { valorRecebido: 0 }) }); });
  db.pagar = db.pagar.filter(t => !(c.criou || []).includes(t.id));
  e.conciliado = null;
}, { grava: true });
rota('DELETE', '/api/extrato/:id', (req, b, u, p) => {
  exigir(u.papel === 'admin'); const e = db.extrato.find(x => x.id === p.id); exigir(e, 'Lançamento não encontrado', 404);
  exigir(!e.conciliado, 'Desfaça a conciliação antes de excluir.', 400);
  db.extrato = db.extrato.filter(x => x.id !== p.id);
}, { grava: true });

rota('PUT', '/api/empresa', (req, b, u) => {
  exigir(u.papel === 'admin');
  for (const k of ['nome', 'fantasia', 'cnpj', 'ie', 'telefone', 'email', 'logradouro', 'numero', 'bairro', 'cidade', 'uf', 'cep', 'regime']) if (k in b) db.empresa[k] = String(b[k] ?? '').trim();
}, { grava: true });
rota('GET', '/api/backup', (req, b, u) => { exigir(u.papel === 'admin'); return { backup: db }; });
rota('POST', '/api/restore', (req, b, u) => {
  exigir(u.papel === 'admin'); const d = b.backup;
  exigir(d && d.empresa && Array.isArray(d.produtos) && Array.isArray(d.pedidos), 'Arquivo de backup inválido', 400);
  if (!Array.isArray(d.usuarios) || !d.usuarios.some(x => x.papel === 'admin' && x.senha)) d.usuarios = db.usuarios; // backup do sistema antigo (sem usuários)
  d.seq = d.seq || { pedido: Math.max(0, ...d.pedidos.map(p => p.numero || 0)), nfe: 0 }; d.seq.nfe = d.seq.nfe || 0; d.seq.compra = d.seq.compra || 0;
  substituirTudo(d);
}, { grava: true });
rota('POST', '/api/reset', (req, b, u) => {
  exigir(u.papel === 'admin');
  if (b.modo === 'demo') { const d = seedDemo(uid, hashSenha); d.usuarios = [...db.usuarios.filter(x => x.papel === 'admin'), ...d.usuarios.filter(x => x.papel !== 'admin')]; substituirTudo(d); }
  else { const d = baseVazia(); d.empresa = db.empresa; d.usuarios = db.usuarios.filter(x => x.papel === 'admin'); substituirTudo(d); }
}, { grava: true });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return estatico(req, res);
  const r = rotas.find(x => x.m === req.method && x.re.test(url.pathname));
  if (!r) return enviar(res, 404, { erro: 'Rota não encontrada' });
  try {
    const params = url.pathname.match(r.re).groups || {};
    const body = ['POST', 'PUT'].includes(req.method) ? await lerCorpo(req) : {};
    let u = null;
    if (!r.publica) { u = lerToken((req.headers.authorization || '').replace(/^Bearer /, '')); if (!u) throw new Erro(401, 'Sessão expirada. Entre novamente.'); }
    const out = await r.fn(req, body, u, params);
    if (r.grava) persistir();
    enviar(res, 200, { ok: true, ...(out || {}), ...(u && !(out && out.data) ? { data: visao(u) } : {}) });
  } catch (e) {
    if (!(e instanceof Erro)) { console.error(e); carregar(); } // erro inesperado: descarta alterações em memória
    enviar(res, e.status || 500, { erro: e instanceof Erro ? e.message : 'Erro interno', ...(e.extra || {}) });
  }
});

if (!carregar()) {
  // DADOS_INICIAIS=vazio → começa só com o administrador (recomendado em produção)
  // ADMIN_EMAIL / ADMIN_SENHA → define o login do administrador inicial
  const vazio = process.env.DADOS_INICIAIS === 'vazio';
  console.log(vazio ? 'Banco novo — base vazia.' : 'Banco novo — carregando dados de demonstração...');
  const d = vazio ? baseVazia() : seedDemo(uid, hashSenha);
  const email = (process.env.ADMIN_EMAIL || 'admin@distribpro.local').trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA || 'admin123';
  if (process.env.ADMIN_SENHA && senha.length < 8) { console.error('ADMIN_SENHA deve ter pelo menos 8 caracteres.'); process.exit(1); }
  d.usuarios = [{ id: 'u1', nome: 'Administrador', email, senha: hashSenha(senha), papel: 'admin', vendedorId: '', clienteId: '', ativo: 'Sim' },
    ...d.usuarios.filter(x => x.papel !== 'admin')];
  substituirTudo(d);
}
server.listen(PORT, () => {
  console.log(`\nDistribPro rodando em http://localhost:${PORT}`);
  console.log(`Banco: ${DB_FILE} · NF-e: ${NFE.provedor()}`);
  if (db.usuarios.some(x => x.email === 'admin@distribpro.local' && conferirSenha('admin123', x.senha))) console.log('Login inicial: admin@distribpro.local / admin123 (troque a senha!)\n');
});
