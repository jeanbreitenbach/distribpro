/*
 * RepCRM — CRM para representante comercial
 * Node.js >= 22.13, sem dependências externas (usa node:sqlite embutido).
 *   node server.js            → http://localhost:3100
 */
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
process.removeAllListeners('warning'); // silencia aviso "SQLite is experimental"
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const R = require('./lib/regras');
const { seedDemo, baseVazia } = require('./lib/seed');

const PORT = Number(process.env.PORT) || 3100;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'repcrm.db');
const COLS = ['representadas', 'clientes', 'produtos', 'oportunidades', 'pedidos', 'atividades', 'usuarios'];
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

let db; const cache = new Map();
function carregar() {
  cache.clear();
  const meta = Object.fromEntries(sql.prepare('SELECT key,value FROM meta').all().map(r => [r.key, JSON.parse(r.value)]));
  if (!meta.config) return false;
  db = { config: meta.config, seq: meta.seq };
  COLS.forEach(c => db[c] = []);
  for (const r of sql.prepare('SELECT col,id,data FROM docs').all()) {
    if (!db[r.col]) continue; db[r.col].push(JSON.parse(r.data)); cache.set(r.col + '\0' + r.id, r.data);
  }
  return true;
}
/** Grava só os documentos alterados, numa transação. */
function persistir() {
  sql.exec('BEGIN');
  try {
    const vivos = new Set();
    for (const c of COLS) for (const o of db[c]) {
      const k = c + '\0' + o.id, j = JSON.stringify(o); vivos.add(k);
      if (cache.get(k) !== j) { qUpsert.run(c, o.id, j); cache.set(k, j); }
    }
    for (const k of [...cache.keys()]) if (!vivos.has(k)) { const [c, id] = k.split('\0'); qDelete.run(c, id); cache.delete(k); }
    qMeta.run('config', JSON.stringify(db.config)); qMeta.run('seq', JSON.stringify(db.seq));
    sql.exec('COMMIT');
  } catch (e) { sql.exec('ROLLBACK'); throw e; }
}
function substituirTudo(novo) { db = novo; COLS.forEach(c => db[c] = db[c] || []); db.seq = db.seq || { pedido: 0 }; persistir(); }

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
  let d; try { d = JSON.parse(Buffer.from(p, 'base64url').toString()); } catch { return null; }
  if (d.exp < Date.now()) return null;
  const u = R.find(db, 'usuarios', d.uid);
  if (!u || u.ativo === 'Não' || u.senha.slice(0, 8) !== d.v) return null; // trocar a senha derruba sessões antigas
  return u;
}
const tentativas = new Map();
setInterval(() => { const t = Date.now(); for (const [k, v] of tentativas) if (v.ate < t) tentativas.delete(k); }, 10 * 60e3).unref();
const ipCliente = req => (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;

const visao = u => ({ me: { id: u.id, nome: u.nome, email: u.email }, config: db.config,
  ...Object.fromEntries(COLS.map(c => [c, db[c]])), usuarios: db.usuarios.map(({ senha, ...x }) => x) });

/* ================= Cadastros (campos permitidos) ================= */
const T = 'text', N = 'number';
const CAMPOS = {
  representadas: { nome: T, razao: T, cnpj: T, segmento: T, contato: T, telefone: T, email: T, site: T, comissao: N, baseComissao: T, diasComissao: N, metaMensal: N, pedidoMinimo: N, condicoes: T, cor: T, obs: T, ativo: T },
  clientes: { razao: T, fantasia: T, cnpj: T, ie: T, contato: T, cargo: T, telefone: T, whatsapp: T, email: T, logradouro: T, numero: T, bairro: T, cidade: T, uf: T, cep: T, segmento: T, status: T, origem: T, cicloCompra: N, aniversario: T, obs: T },
  produtos: { representadaId: T, codigo: T, descricao: T, unidade: T, embalagem: N, preco: N, ipi: N, comissao: N, ean: T, ativo: T },
  oportunidades: { titulo: T, clienteId: T, representadaId: T, valor: N, etapa: T, probabilidade: N, previsao: T, obs: T, motivoPerda: T },
  atividades: { tipo: T, clienteId: T, oportunidadeId: T, data: T, hora: T, assunto: T, descricao: T, status: T, resultado: T },
  usuarios: { nome: T, email: T, ativo: T },
};
const OBRIG = { representadas: ['nome', 'o nome da representada'], clientes: ['razao', 'a razão social'], produtos: ['descricao', 'a descrição'], oportunidades: ['titulo', 'o título'], atividades: ['assunto', 'o assunto'], usuarios: ['email', 'o e-mail'] };

class Erro extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const exigir = (cond, msg = 'Sem permissão', st = 400) => { if (!cond) throw new Erro(st, msg); };
const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

function salvarCadastro(u, col, body) {
  const campos = CAMPOS[col]; exigir(campos, 'Coleção inválida', 404);
  const o = body.id ? R.find(db, col, body.id) : null;
  if (body.id) exigir(o, 'Registro não encontrado', 404);
  const novo = { ...(o || {}), id: o ? o.id : uid() };
  for (const [k, t] of Object.entries(campos)) if (k in body) novo[k] = t === N ? R.r2(String(body[k] ?? '').replace(',', '.')) : String(body[k] ?? '').trim().slice(0, 4000);
  const [ob, nome] = OBRIG[col]; exigir(novo[ob], 'Preencha ' + nome);
  if (col === 'representadas') {
    novo.baseComissao = novo.baseComissao === 'Pagamento' ? 'Pagamento' : 'Faturamento';
    exigir(novo.comissao >= 0 && novo.comissao <= 100, 'Comissão deve ficar entre 0 e 100%');
  }
  if (col === 'clientes') { novo.status = R.STATUS_CLIENTE.includes(novo.status) ? novo.status : 'Prospect'; if (!o) novo.criadoEm = R.hoje(); }
  if (col === 'produtos') {
    exigir(R.find(db, 'representadas', novo.representadaId), 'Selecione a representada');
    if (novo.codigo) exigir(!db.produtos.some(p => p.id !== novo.id && p.representadaId === novo.representadaId && p.codigo.toLowerCase() === novo.codigo.toLowerCase()), 'Já existe um produto com este código nesta representada');
  }
  if (col === 'oportunidades') {
    exigir(R.find(db, 'clientes', novo.clienteId), 'Selecione o cliente');
    novo.etapa = R.ETAPAS.includes(novo.etapa) ? novo.etapa : 'Prospecção';
    if (!('probabilidade' in body) || body.probabilidade === '') novo.probabilidade = R.PROB[novo.etapa];
    if (!o) novo.criadaEm = R.hoje();
    if (['Ganha', 'Perdida'].includes(novo.etapa)) novo.fechadaEm = novo.fechadaEm || R.hoje(); else novo.fechadaEm = '';
  }
  if (col === 'atividades') {
    exigir(R.TIPOS.includes(novo.tipo), 'Tipo de atividade inválido');
    exigir(dataOk(novo.data), 'Informe a data');
    novo.status = novo.status === 'Concluída' ? 'Concluída' : 'Pendente';
    if (novo.status === 'Concluída') novo.concluidaEm = novo.concluidaEm || R.hoje(); else novo.concluidaEm = '';
    if (!o) novo.criadaPor = u.nome;
  }
  if (col === 'usuarios') {
    novo.email = novo.email.toLowerCase();
    exigir(/^[^@\s]+@[^@\s]+$/.test(novo.email), 'E-mail inválido');
    exigir(!db.usuarios.some(x => x.email === novo.email && x.id !== novo.id), 'E-mail já cadastrado');
    if (body.senha) { exigir(String(body.senha).length >= 6, 'A senha deve ter pelo menos 6 caracteres'); novo.senha = hashSenha(body.senha); }
    exigir(novo.senha, 'Informe uma senha');
    if (o && o.id === u.id) exigir(novo.ativo !== 'Não', 'Você não pode desativar o seu próprio acesso');
  }
  if (o) Object.assign(o, novo); else db[col].push(novo);
  return { id: novo.id };
}
function excluirCadastro(u, col, id) {
  exigir(CAMPOS[col], 'Coleção inválida', 404); exigir(R.find(db, col, id), 'Registro não encontrado', 404);
  const emUso = {
    representadas: () => db.pedidos.some(p => p.representadaId === id) || db.produtos.some(p => p.representadaId === id),
    clientes: () => db.pedidos.some(p => p.clienteId === id),
    usuarios: () => id === u.id,
  }[col];
  exigir(!emUso || !emUso(), col === 'usuarios' ? 'Você não pode excluir o seu próprio usuário' : 'Registro em uso (tem pedidos ou produtos ligados). Marque-o como inativo.');
  db[col] = db[col].filter(x => x.id !== id);
  if (col === 'clientes') { db.atividades = db.atividades.filter(a => a.clienteId !== id); db.oportunidades = db.oportunidades.filter(o => o.clienteId !== id); }
  if (col === 'oportunidades') db.atividades.forEach(a => { if (a.oportunidadeId === id) a.oportunidadeId = ''; });
}

/* ================= Pedidos ================= */
const temRecebida = p => (p.comissoes || []).some(c => c.recebida);
function historico(p, u, txt) { (p.historico = p.historico || []).push({ em: new Date().toISOString(), por: u.nome, txt }); }
/** Aplica mudança de status e mantém as parcelas de comissão coerentes. */
function aplicarStatus(u, p, status, extra = {}) {
  exigir(R.STATUS.includes(status), 'Status inválido');
  const era = p.status, eraF = R.FATURADOS.includes(era), seraF = R.FATURADOS.includes(status);
  for (const k of ['nf', 'pedidoFabrica']) if (k in extra) p[k] = String(extra[k] ?? '').trim().slice(0, 60);
  if (seraF) {
    if ('dataFaturamento' in extra) p.dataFaturamento = String(extra.dataFaturamento || '');
    if ('valorFaturado' in extra) p.valorFaturado = R.r2(String(extra.valorFaturado ?? '').replace(',', '.'));
    p.dataFaturamento = p.dataFaturamento || R.hoje();
    exigir(dataOk(p.dataFaturamento), 'Data de faturamento inválida');
    exigir(!(p.valorFaturado < 0), 'Valor faturado inválido');
  }
  if (eraF && !seraF) {
    exigir(!temRecebida(p), 'Este pedido já tem comissão recebida. Estorne o recebimento antes de mudar o status.');
    p.comissoes = []; p.dataFaturamento = ''; p.valorFaturado = 0;
  }
  if (seraF && !temRecebida(p)) p.comissoes = R.parcelasComissao(p, R.find(db, 'representadas', p.representadaId));
  if (status === 'Enviado' && !p.enviadoEm) p.enviadoEm = R.hoje();
  if (status === 'Entregue') p.entregueEm = p.entregueEm || R.hoje();
  p.status = status;
  if (era !== status) historico(p, u, era ? `${era} → ${status}` : `Criado como ${status}`);
}
function salvarPedido(u, b) {
  exigir(Array.isArray(b.itens), 'Dados inválidos');
  const ant = b.id ? R.find(db, 'pedidos', b.id) : null;
  if (b.id) exigir(ant, 'Pedido não encontrado', 404);
  if (ant && temRecebida(ant)) exigir(false, 'Este pedido já tem comissão recebida e não pode mais ser alterado. Estorne o recebimento antes.');
  const cli = R.find(db, 'clientes', b.clienteId); exigir(cli, 'Selecione o cliente');
  const rep = R.find(db, 'representadas', b.representadaId); exigir(rep, 'Selecione a representada');
  exigir(b.itens.length, 'Inclua pelo menos um item');
  const itens = b.itens.map(i => {
    const pr = i.produtoId ? R.find(db, 'produtos', i.produtoId) : null;
    if (pr) exigir(pr.representadaId === rep.id, `O produto ${pr.descricao} não é da representada ${rep.nome}`);
    const it = { produtoId: pr ? pr.id : '', codigo: String(i.codigo ?? (pr ? pr.codigo : '')).slice(0, 60), descricao: String(i.descricao || (pr ? pr.descricao : '')).trim().slice(0, 300),
      unidade: String(i.unidade || (pr ? pr.unidade : '') || 'UN').slice(0, 10), qtd: R.r2(i.qtd), preco: R.r2(i.preco), desc: R.r2(i.desc), ipi: R.r2(i.ipi),
      comissao: i.comissao === '' || i.comissao == null ? R.r2(pr && pr.comissao ? pr.comissao : rep.comissao) : R.r2(i.comissao) };
    exigir(it.descricao, 'Item sem descrição'); exigir(it.qtd > 0, `Quantidade inválida em "${it.descricao}"`); exigir(it.preco >= 0, `Preço inválido em "${it.descricao}"`);
    exigir(it.desc >= 0 && it.desc <= 100 && it.comissao >= 0 && it.comissao <= 100 && it.ipi >= 0, `Percentual inválido em "${it.descricao}"`);
    return it;
  });
  const p = ant || { id: uid(), numero: ++db.seq.pedido, criadoEm: new Date().toISOString(), criadoPor: u.nome, comissoes: [], historico: [] };
  Object.assign(p, { clienteId: cli.id, representadaId: rep.id, itens, data: dataOk(b.data) ? b.data : (p.data || R.hoje()),
    descontoGeral: R.r2(b.descontoGeral), condicao: String(b.condicao || '').trim().slice(0, 80), prazoEntrega: String(b.prazoEntrega || '').trim().slice(0, 80),
    transportadora: String(b.transportadora || '').trim().slice(0, 120), obs: String(b.obs || '').trim().slice(0, 2000) });
  exigir(p.descontoGeral >= 0 && p.descontoGeral < 100, 'Desconto geral inválido');
  if (b.oportunidadeId) { const op = R.find(db, 'oportunidades', b.oportunidadeId); if (op) { p.oportunidadeId = op.id; op.pedidoId = p.id; op.etapa = 'Ganha'; op.probabilidade = 100; op.fechadaEm = op.fechadaEm || R.hoje(); op.valor = R.totais(p).mercadoria; } }
  if (!ant) { db.pedidos.push(p); if (cli.status === 'Prospect') cli.status = 'Ativo'; }
  aplicarStatus(u, p, b.status || p.status || 'Orçamento', b);
  return { id: p.id, numero: p.numero };
}

/* ================= HTTP ================= */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function enviar(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(obj));
}
function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let tam = 0; const partes = [];
    req.on('data', c => { tam += c.length; if (tam > 30e6) { falha(new Erro(413, 'Requisição muito grande')); req.destroy(); } else partes.push(c); });
    req.on('end', () => {
      let v; try { v = partes.length ? JSON.parse(Buffer.concat(partes).toString()) : {}; } catch { return falha(new Erro(400, 'JSON inválido')); }
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return falha(new Erro(400, 'Corpo da requisição inválido'));
      ok(v);
    });
  });
}
const PUB = path.join(__dirname, 'public');
function estatico(req, res) {
  let f = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (f === '/regras.js') f = path.join(__dirname, 'lib', 'regras.js');
  else { if (f === '/' || !path.extname(f)) f = '/index.html'; f = path.join(PUB, path.normalize(f)); if (!f.startsWith(PUB + path.sep)) return enviar(res, 404, {}); }
  fs.readFile(f, (e, buf) => {
    if (e) return enviar(res, 404, { erro: 'Não encontrado' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Cache-Control': /\.(png|svg)$/.test(f) ? 'public, max-age=86400' : 'no-cache' });
    res.end(buf);
  });
}
const rotas = [];
const rota = (m, p, fn, opts = {}) => rotas.push({ m, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, ...opts });

rota('POST', '/api/login', (req, b) => {
  const ip = ipCliente(req), email = String(b.email || '').trim().toLowerCase().slice(0, 120), agora = Date.now();
  const kE = 'e|' + ip + '|' + email, kI = 'i|' + ip;
  const tE = tentativas.get(kE) || { n: 0, ate: 0 }, tI = tentativas.get(kI) || { n: 0, ate: 0 };
  if (tE.ate > agora || tI.ate > agora) throw new Erro(429, 'Muitas tentativas. Aguarde alguns minutos.');
  const u = db.usuarios.find(x => x.email === email);
  if (!u || u.ativo === 'Não' || !conferirSenha(b.senha || '', u.senha)) {
    tE.n++; tI.n++;
    if (tE.n >= 8) { tE.ate = agora + 5 * 60e3; tE.n = 0; }
    if (tI.n >= 40) { tI.ate = agora + 5 * 60e3; tI.n = 0; }
    tentativas.set(kE, tE); tentativas.set(kI, tI);
    throw new Erro(401, 'E-mail ou senha incorretos');
  }
  tentativas.delete(kE); u.ultimoAcesso = new Date().toISOString();
  return { token: gerarToken(u), data: visao(u) };
}, { publica: true, grava: true, semRollback: true });
rota('GET', '/api/health', () => ({ status: 'ok' }), { publica: true });
rota('GET', '/api/data', () => null);
rota('POST', '/api/senha', (req, b, u) => {
  exigir(conferirSenha(b.atual || '', u.senha), 'Senha atual incorreta');
  exigir(String(b.nova || '').length >= 6, 'A nova senha deve ter pelo menos 6 caracteres');
  u.senha = hashSenha(b.nova); return { token: gerarToken(u) };
}, { grava: true });
rota('PUT', '/api/crud/:col', (req, b, u, p) => salvarCadastro(u, p.col, b), { grava: true });
rota('DELETE', '/api/crud/:col/:id', (req, b, u, p) => excluirCadastro(u, p.col, p.id), { grava: true });

rota('POST', '/api/oportunidades/:id/etapa', (req, b, u, p) => {
  const o = R.find(db, 'oportunidades', p.id); exigir(o, 'Oportunidade não encontrada', 404);
  exigir(R.ETAPAS.includes(b.etapa), 'Etapa inválida');
  if (b.etapa === 'Perdida') exigir(String(b.motivoPerda || o.motivoPerda || '').trim(), 'Informe o motivo da perda');
  o.etapa = b.etapa; o.probabilidade = R.PROB[b.etapa];
  if (b.motivoPerda) o.motivoPerda = String(b.motivoPerda).trim().slice(0, 300);
  o.fechadaEm = ['Ganha', 'Perdida'].includes(o.etapa) ? (o.fechadaEm || R.hoje()) : '';
}, { grava: true });
rota('POST', '/api/atividades/:id/concluir', (req, b, u, p) => {
  const a = R.find(db, 'atividades', p.id); exigir(a, 'Atividade não encontrada', 404);
  a.status = b.reabrir ? 'Pendente' : 'Concluída'; a.concluidaEm = b.reabrir ? '' : R.hoje();
  if ('resultado' in b) a.resultado = String(b.resultado || '').trim().slice(0, 2000);
  let prox = null;
  if (!b.reabrir && b.proxima && dataOk(b.proxima.data)) { // já agenda o próximo contato
    prox = { id: uid(), tipo: R.TIPOS.includes(b.proxima.tipo) ? b.proxima.tipo : a.tipo, clienteId: a.clienteId, oportunidadeId: a.oportunidadeId || '', data: b.proxima.data, hora: String(b.proxima.hora || ''),
      assunto: String(b.proxima.assunto || 'Retorno: ' + a.assunto).slice(0, 200), descricao: '', status: 'Pendente', resultado: '', criadaPor: u.nome };
    db.atividades.push(prox);
  }
  return { proximaId: prox && prox.id };
}, { grava: true });

rota('POST', '/api/pedidos', (req, b, u) => salvarPedido(u, b), { grava: true });
rota('POST', '/api/pedidos/:id/status', (req, b, u, p) => {
  const ped = R.find(db, 'pedidos', p.id); exigir(ped, 'Pedido não encontrado', 404);
  if (temRecebida(ped)) exigir(R.FATURADOS.includes(b.status) && !('valorFaturado' in b) && !('dataFaturamento' in b), 'Este pedido já tem comissão recebida. Estorne o recebimento antes de mudar o faturamento.');
  aplicarStatus(u, ped, b.status, b);
}, { grava: true });
rota('DELETE', '/api/pedidos/:id', (req, b, u, p) => {
  const ped = R.find(db, 'pedidos', p.id); exigir(ped, 'Pedido não encontrado', 404);
  exigir(['Orçamento', 'Cancelado'].includes(ped.status), 'Só é possível excluir pedidos em Orçamento ou Cancelados.');
  db.pedidos = db.pedidos.filter(x => x.id !== p.id);
  db.oportunidades.forEach(o => { if (o.pedidoId === p.id) o.pedidoId = ''; });
}, { grava: true });

/** Baixa de comissões: [{pedidoId, n, valor?}] — valor diferente do previsto fica registrado (ex.: fábrica descontou devolução). */
rota('POST', '/api/comissoes/receber', (req, b, u) => {
  exigir(Array.isArray(b.parcelas) && b.parcelas.length, 'Selecione as comissões');
  const data = dataOk(b.data) ? b.data : R.hoje();
  for (const it of b.parcelas) {
    const p = R.find(db, 'pedidos', it.pedidoId); exigir(p, 'Pedido não encontrado', 404);
    const c = (p.comissoes || []).find(x => x.n === Number(it.n)); exigir(c, `Parcela ${it.n} do pedido ${p.numero} não encontrada`, 404);
    exigir(!c.recebida, `A comissão do pedido ${p.numero} (parcela ${c.n}) já foi recebida`);
    const v = it.valor === undefined || it.valor === '' ? c.valor : R.r2(String(it.valor).replace(',', '.'));
    exigir(v >= 0, 'Valor inválido');
    Object.assign(c, { recebida: true, recebidaEm: data, valorRecebido: v });
  }
}, { grava: true });
rota('POST', '/api/comissoes/estornar', (req, b, u) => {
  const p = R.find(db, 'pedidos', b.pedidoId); exigir(p, 'Pedido não encontrado', 404);
  const c = (p.comissoes || []).find(x => x.n === Number(b.n)); exigir(c && c.recebida, 'Parcela não está recebida');
  Object.assign(c, { recebida: false, recebidaEm: '', valorRecebido: 0 });
}, { grava: true });

/** Importa tabela de preço da representada (linhas já lidas do CSV no navegador). Atualiza pelo código. */
rota('POST', '/api/produtos/importar', (req, b) => {
  const rep = R.find(db, 'representadas', b.representadaId); exigir(rep, 'Selecione a representada');
  exigir(Array.isArray(b.linhas) && b.linhas.length && b.linhas.length <= 20000, 'Nenhuma linha para importar');
  let novos = 0, atualizados = 0;
  const porCodigo = new Map(db.produtos.filter(p => p.representadaId === rep.id && p.codigo).map(p => [p.codigo.toLowerCase(), p]));
  for (const l of b.linhas) {
    const desc = String(l.descricao || '').trim(); if (!desc) continue;
    const cod = String(l.codigo || '').trim();
    const dados = { descricao: desc.slice(0, 300), preco: R.r2(l.preco) }; // números já convertidos no navegador
    for (const k of ['unidade', 'ean']) if (l[k]) dados[k] = String(l[k]).trim().slice(0, 40);
    for (const k of ['ipi', 'comissao', 'embalagem']) if (l[k] !== undefined && l[k] !== '' && l[k] !== null) dados[k] = R.r2(l[k]);
    const ex = cod && porCodigo.get(cod.toLowerCase());
    if (ex) { Object.assign(ex, dados); atualizados++; }
    else { const p = { id: uid(), representadaId: rep.id, codigo: cod, unidade: 'UN', ipi: 0, comissao: 0, embalagem: 0, ativo: 'Sim', ean: '', ...dados }; db.produtos.push(p); if (cod) porCodigo.set(cod.toLowerCase(), p); novos++; }
  }
  return { novos, atualizados };
}, { grava: true });

/** Importa clientes de planilha (ex.: exportação do Mercos). Quem já existe (mesmo CNPJ/CPF ou mesma razão social) é atualizado. */
rota('POST', '/api/clientes/importar', (req, b) => {
  exigir(Array.isArray(b.linhas) && b.linhas.length && b.linhas.length <= 10000, 'Nenhum cliente para importar');
  const dig = v => String(v || '').replace(/\D/g, '');
  const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const status = R.STATUS_CLIENTE.includes(b.status) ? b.status : 'Ativo', origem = String(b.origem || '').trim().slice(0, 60);
  const porDoc = new Map(), porNome = new Map();
  for (const c of db.clientes) { if (dig(c.cnpj).length >= 11) porDoc.set(dig(c.cnpj), c); porNome.set(norm(c.razao), c); }
  const textos = Object.keys(CAMPOS.clientes).filter(k => CAMPOS.clientes[k] === T && !['status', 'origem'].includes(k));
  let novos = 0, atualizados = 0, ignorados = 0;
  for (const l of b.linhas) {
    const razao = String((l && (l.razao || l.fantasia)) || '').trim().slice(0, 300);
    if (!razao) { ignorados++; continue; }
    const doc = dig(l.cnpj);
    const dados = {};
    for (const k of textos) if (l[k] != null && String(l[k]).trim()) dados[k] = String(l[k]).trim().slice(0, 1000);
    dados.razao = razao;
    const ex = (doc.length >= 11 && porDoc.get(doc)) || porNome.get(norm(razao));
    if (ex) { Object.assign(ex, dados); atualizados++; }
    else {
      const c = { id: uid(), status, origem, cicloCompra: 45, criadoEm: R.hoje(), ...dados };
      db.clientes.push(c); if (doc.length >= 11) porDoc.set(doc, c); porNome.set(norm(razao), c); novos++;
    }
  }
  exigir(novos + atualizados, 'Nenhuma linha com razão social para importar');
  return { novos, atualizados, ignorados };
}, { grava: true });
rota('PUT', '/api/config', (req, b) => {
  for (const k of ['nome', 'empresa', 'cnpj', 'core', 'telefone', 'email', 'cidade', 'uf', 'rodape']) if (k in b) db.config[k] = String(b[k] ?? '').trim().slice(0, 500);
}, { grava: true });
rota('GET', '/api/backup', () => ({ backup: { ...db, usuarios: db.usuarios } }));
rota('POST', '/api/restore', (req, b) => {
  const d = b.backup;
  exigir(d && d.config && Array.isArray(d.pedidos) && Array.isArray(d.clientes) && Array.isArray(d.representadas), 'Arquivo de backup inválido');
  if (!Array.isArray(d.usuarios) || !d.usuarios.some(x => x.senha)) d.usuarios = db.usuarios;
  d.seq = { pedido: Math.max(Number(d.seq && d.seq.pedido) || 0, 0, ...d.pedidos.map(p => p.numero || 0)) };
  substituirTudo(d);
}, { grava: true });
rota('POST', '/api/reset', (req, b, u) => {
  const d = b.modo === 'demo' ? seedDemo(uid) : baseVazia();
  d.config = b.modo === 'demo' ? d.config : db.config; d.usuarios = db.usuarios; substituirTudo(d);
}, { grava: true });

const qVersao = sql.prepare("SELECT value FROM meta WHERE key='alteracao_externa'");
let versaoExterna = (qVersao.get() || {}).value;
const server = http.createServer(async (req, res) => {
  const ve = (qVersao.get() || {}).value; if (ve !== versaoExterna) { versaoExterna = ve; carregar(); }
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
    if (!(e instanceof Erro)) console.error(e);
    if ((r.grava && !r.semRollback) || !(e instanceof Erro)) carregar(); // nada fica pela metade
    enviar(res, e.status || 500, { erro: e instanceof Erro ? e.message : 'Erro interno' });
  }
});

// ---- node server.js redefinir-senha <email> <nova-senha> ----
if (process.argv[2] === 'redefinir-senha') {
  const [, , , email, nova] = process.argv;
  if (!carregar()) { console.error('Banco ainda não criado. Inicie o servidor uma vez antes.'); process.exit(1); }
  const u = db.usuarios.find(x => x.email === String(email || '').toLowerCase());
  if (!u || !nova || nova.length < 8) { console.error('Uso: node server.js redefinir-senha <email> <nova-senha (mín. 8 caracteres)>'); process.exit(1); }
  u.senha = hashSenha(nova); u.ativo = 'Sim'; persistir(); qMeta.run('alteracao_externa', JSON.stringify(Date.now()));
  console.log(`Senha de ${u.email} redefinida.`); process.exit(0);
}

if (!carregar()) {
  const vazio = process.env.DADOS_INICIAIS === 'vazio';
  console.log(vazio ? 'Banco novo — base vazia.' : 'Banco novo — carregando dados de demonstração...');
  const d = vazio ? baseVazia() : seedDemo(uid);
  const email = (process.env.ADMIN_EMAIL || 'admin@repcrm.local').trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA || 'admin123';
  if (process.env.ADMIN_SENHA && senha.length < 8) { console.error('ADMIN_SENHA deve ter pelo menos 8 caracteres.'); process.exit(1); }
  d.usuarios = [{ id: 'u1', nome: (process.env.ADMIN_NOME || d.config.nome || 'Representante'), email, senha: hashSenha(senha), ativo: 'Sim' }];
  substituirTudo(d);
}

// ---- Backup automático diário ----
const DIR_BACKUP = process.env.BACKUP_DIR || path.join(path.dirname(DB_FILE), 'backups');
const MANTER = Math.max(1, Number(process.env.BACKUP_DIAS) || 14);
function backupDiario() {
  try {
    fs.mkdirSync(DIR_BACKUP, { recursive: true });
    const arq = path.join(DIR_BACKUP, `repcrm-${R.hoje()}.db`);
    if (fs.existsSync(arq)) return;
    sql.exec(`VACUUM INTO '${arq.replace(/'/g, "''")}'`);
    fs.readdirSync(DIR_BACKUP).filter(f => /^repcrm-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(MANTER).forEach(f => fs.unlinkSync(path.join(DIR_BACKUP, f)));
  } catch (e) { console.error('Falha no backup automático:', e.message); }
}
if (process.env.BACKUP_DIAS !== '0') { setTimeout(backupDiario, 5000).unref(); setInterval(backupDiario, 60 * 60e3).unref(); }

let desligando = false;
for (const sinal of ['SIGTERM', 'SIGINT']) process.on(sinal, () => {
  if (desligando) return; desligando = true;
  server.close(() => { try { sql.exec('PRAGMA wal_checkpoint(TRUNCATE)'); sql.close(); } catch (e) { } process.exit(0); });
  setTimeout(() => process.exit(0), 8000).unref();
});

server.listen(PORT, () => {
  console.log(`\nRepCRM rodando em http://localhost:${PORT}`);
  if (db.usuarios.some(x => x.email === 'admin@repcrm.local' && conferirSenha('admin123', x.senha))) console.log('Login inicial: admin@repcrm.local / admin123 (troque a senha!)\n');
});
