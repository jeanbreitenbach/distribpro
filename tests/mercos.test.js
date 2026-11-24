/* Integração com o Mercos contra um Mercos simulado: paginação por alterado_apos, HTTP 429, tabela de preço e vínculos. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'distribpro-mercos-'));
const portaLivre = () => new Promise(ok => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
let PORTA, srv, fake, erros = '';
const chamadas = { produtos: 0, tokensErrados: 0, limitado: false };

const PRODUTOS = [
  { id: 1, codigo: 'IP-TRAD-2KG', nome: 'PAO DE QUEIJO TRAD 2KG', preco_tabela: 50, saldo_estoque: 5, unidade: 'PCT', ativo: true, excluido: false, ultima_alteracao: '2026-01-01 10:00:00' },
  { id: 2, codigo: 'X99', nome: 'PAO QUEIJO TINO 800G', preco_tabela: 15.5, saldo_estoque: 300, unidade: 'PCT', ativo: true, excluido: false, ultima_alteracao: '2026-01-02 10:00:00' },
  { id: 3, codigo: 'TINO-TRAD-400', nome: 'PAO QUEIJO TINO 400G', preco_tabela: 8, saldo_estoque: null, unidade: 'PCT', ativo: true, excluido: false, ultima_alteracao: '2026-01-03 10:00:00' },
  { id: 4, codigo: 'IP-COQ-800', nome: 'COQUETEL (excluído)', preco_tabela: 20, saldo_estoque: 10, unidade: 'PCT', ativo: true, excluido: true, ultima_alteracao: '2026-01-04 10:00:00' },
  { id: 5, codigo: 'IP-LANCHE-1KG', nome: 'LANCHE (inativo)', preco_tabela: 20, saldo_estoque: 10, unidade: 'PCT', ativo: false, excluido: false, ultima_alteracao: '2026-01-05 10:00:00' }];
const TAB = [{ id: 9, tabela_id: 7, produto_id: 1, preco: 45, excluido: false, ultima_alteracao: '2026-01-01 11:00:00' },
  { id: 10, tabela_id: 8, produto_id: 2, preco: 1, excluido: false, ultima_alteracao: '2026-01-01 12:00:00' }];

function lote(res, lista, desde) { // devolve 2 por vez, como a API faz com lotes maiores
  const rest = lista.filter(x => x.ultima_alteracao > desde).sort((a, b) => a.ultima_alteracao.localeCompare(b.ultima_alteracao));
  res.writeHead(200, { 'Content-Type': 'application/json', ...(rest.length > 2 ? { 'MEUSPEDIDOS_LIMITOU_REGISTROS': '1' } : {}) });
  res.end(JSON.stringify(rest.slice(0, 2)));
}
const req = async (m, url, corpo, tok) => {
  const r = await fetch(`http://127.0.0.1:${PORTA}${url}`, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: corpo && JSON.stringify(corpo) });
  return { status: r.status, json: await r.json() };
};

before(async () => {
  fake = http.createServer((q, res) => {
    const u = new URL(q.url, 'http://x');
    if (q.headers.applicationtoken !== 'app-tok' || q.headers.companytoken !== 'emp-tok') { chamadas.tokensErrados++; res.writeHead(401); return res.end('{}'); }
    const desde = u.searchParams.get('alterado_apos') || '';
    if (u.pathname === '/api/v1/produtos') {
      if (++chamadas.produtos === 1) { chamadas.limitado = true; res.writeHead(429, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ tempo_ate_permitir_request: 1 })); }
      return lote(res, PRODUTOS, desde);
    }
    if (u.pathname === '/api/v1/produtos_tabela_preco') return lote(res, TAB, desde);
    res.writeHead(404); res.end('[]');
  }).listen(0);
  PORTA = await portaLivre();
  srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORTA), DB_FILE: path.join(DIR, 't.db'), BACKUP_DIAS: '0',
    MERCOS_APPLICATION_TOKEN: 'app-tok', MERCOS_COMPANY_TOKEN: 'emp-tok', MERCOS_URL: `http://127.0.0.1:${fake.address().port}/api`, MERCOS_TABELA_ID: '7' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', d => { erros += d; });
  await new Promise(ok => srv.stdout.on('data', d => String(d).includes('rodando em') && ok()));
});
after(() => { srv.kill(); fake.close(); fs.rmSync(DIR, { recursive: true, force: true }); });

test('catálogo usa preço e estoque do Mercos', async () => {
  let r; for (let i = 0; i < 40; i++) { r = await req('GET', '/api/catalogo'); if (r.json.itens.length) break; await new Promise(ok => setTimeout(ok, 150)); }
  assert.equal(r.json.fonte, 'mercos');
  assert.ok(chamadas.limitado, 'tratou o HTTP 429 e tentou de novo');
  assert.equal(chamadas.tokensErrados, 0, 'enviou ApplicationToken e CompanyToken');
  const it = Object.fromEntries(r.json.itens.map(i => [i.codigo, i]));
  assert.deepEqual(it['IP-TRAD-2KG'], { codigo: 'IP-TRAD-2KG', unidade: 'PCT', preco: 45, situacao: 'Últimas unidades', estoque: 5 }, 'preço da tabela 7 e estoque do Mercos');
  assert.deepEqual(it['TINO-TRAD-400'], { codigo: 'TINO-TRAD-400', unidade: 'PCT', preco: 8 }, 'sem controle de estoque: só o preço');
  assert.equal(it['IP-COQ-800'], undefined, 'produto excluído no Mercos não aparece');
  assert.equal(it['IP-LANCHE-1KG'], undefined, 'produto inativo no Mercos não aparece');
  assert.equal(it['TINO-TRAD-800'], undefined, 'código diferente: sem vínculo automático');
  assert.equal(r.json.itens.length, 2, 'não usa os produtos do DistribPro quando o Mercos está ligado');
});
test('vínculo manual de item do catálogo com produto do Mercos', async () => {
  const adm = (await req('POST', '/api/login', { email: 'admin@distribpro.local', senha: 'admin123' })).json.token;
  const vend = (await req('POST', '/api/login', { email: 'carlos@distribpro.local', senha: '123456' })).json.token;
  assert.equal((await req('GET', '/api/mercos', undefined, vend)).status, 403);
  const m = (await req('GET', '/api/mercos', undefined, adm)).json;
  assert.equal(m.mercos.produtos, 4); assert.equal(m.mercos.erro, '');
  assert.equal(m.catalogo.find(c => c.codigo === 'IP-TRAD-2KG').mercosId, '1');
  assert.equal((await req('PUT', '/api/mercos/vinculos', { vinculos: { 'TINO-TRAD-800': '2', 'IP-TRAD-2KG': '-', 'NAO-EXISTE': '1' } }, adm)).status, 200);
  const it = Object.fromEntries((await req('GET', '/api/catalogo')).json.itens.map(i => [i.codigo, i]));
  assert.equal(it['TINO-TRAD-800'].preco, 15.5); assert.equal(it['TINO-TRAD-800'].estoque, 300);
  assert.equal(it['IP-TRAD-2KG'], undefined, '"sem vínculo" remove o item');
  assert.equal((await req('POST', '/api/mercos/sincronizar', {}, adm)).status, 200);
});
test('sem erros inesperados no servidor', () => { assert.equal(erros.trim(), '', erros); });
