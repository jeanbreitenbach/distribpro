/* Testes de ponta a ponta da API do RepCRM:  npm test
 * Sobe o servidor numa porta livre com banco temporário e dados de demonstração. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const R = require('../lib/regras');

const RAIZ = path.join(__dirname, '..');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'repcrm-test-'));
let PORTA, srv, TK;
const portaLivre = () => new Promise(ok => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
async function req(m, url, corpo, tok = TK) {
  const r = await fetch(`http://127.0.0.1:${PORTA}${url}`, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, json: await r.json() };
}
const ok = async (...a) => { const r = await req(...a); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };

before(async () => {
  PORTA = await portaLivre();
  srv = spawn(process.execPath, [path.join(RAIZ, 'server.js')], { env: { ...process.env, PORT: String(PORTA), DB_FILE: path.join(DIR, 't.db'), BACKUP_DIAS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; srv.stderr.on('data', d => err += d);
  await new Promise((res, rej) => { srv.stdout.on('data', d => { if (String(d).includes('rodando em')) res(); }); srv.on('exit', c => rej(new Error('saiu ' + c + err))); });
  TK = (await req('POST', '/api/login', { email: 'admin@repcrm.local', senha: 'admin123' })).json.token;
});
after(() => { srv.kill('SIGTERM'); fs.rmSync(DIR, { recursive: true, force: true }); });

test('regras: totais, IPI fora da comissão, parcelas por liquidez', () => {
  const ped = { itens: [{ qtd: 10, preco: 100, desc: 10, ipi: 10, comissao: 5 }], descontoGeral: 0, condicao: '30/60/90', dataFaturamento: '2026-01-10' };
  const t = R.totais(ped);
  assert.deepEqual([t.mercadoria, t.ipi, t.total, t.comissao], [900, 90, 990, 45]);
  const p = R.parcelasComissao(ped, { baseComissao: 'Pagamento', diasComissao: 10 });
  assert.deepEqual(p.map(x => [x.venc, x.valor]), [['2026-02-19', 15], ['2026-03-21', 15], ['2026-04-20', 15]]);
  assert.equal(R.parcelasComissao(ped, { baseComissao: 'Faturamento', diasComissao: 30 }).length, 1);
  assert.equal(R.comissaoFaturada({ ...ped, valorFaturado: 450 }), 22.5, 'faturamento parcial → comissão proporcional');
  assert.deepEqual(R.prazos('À vista'), [0]);
});

test('login e proteção', async () => {
  assert.ok(TK);
  assert.equal((await req('POST', '/api/login', { email: 'admin@repcrm.local', senha: 'x' }, null)).status, 401);
  assert.equal((await req('GET', '/api/data', undefined, null)).status, 401);
  assert.equal((await req('GET', '/api/data', undefined, TK + 'x')).status, 401);
  const d = (await ok('GET', '/api/data')).data;
  assert.ok(d.representadas.length && d.clientes.length && d.pedidos.length);
  assert.ok(d.usuarios.every(u => !('senha' in u)), 'senha nunca vai para o navegador');
});

test('ciclo do pedido: enviado → faturado → comissão → baixa', async () => {
  let d = (await ok('GET', '/api/data')).data;
  const rep = d.representadas.find(r => r.baseComissao === 'Pagamento');
  const prod = d.produtos.find(p => p.representadaId === rep.id);
  const outro = d.produtos.find(p => p.representadaId !== rep.id);
  const cli = d.clientes.find(c => c.status === 'Prospect');
  const base = { clienteId: cli.id, representadaId: rep.id, condicao: '30/60', itens: [{ produtoId: prod.id, qtd: 10, preco: 100, desc: 0, ipi: 0, comissao: '' }] };
  assert.equal((await req('POST', '/api/pedidos', { ...base, itens: [{ produtoId: outro.id, qtd: 1, preco: 1 }] })).status, 400, 'produto de outra representada');
  assert.equal((await req('POST', '/api/pedidos', { ...base, itens: [] })).status, 400);
  const r = await ok('POST', '/api/pedidos', { ...base, status: 'Enviado' });
  let ped = r.data.pedidos.find(p => p.id === r.id);
  assert.equal(ped.status, 'Enviado'); assert.equal(ped.itens[0].comissao, rep.comissao, 'usa comissão padrão da representada');
  assert.equal(r.data.clientes.find(c => c.id === cli.id).status, 'Ativo', 'prospect vira ativo no primeiro pedido');
  // faturamento parcial
  d = (await ok('POST', `/api/pedidos/${r.id}/status`, { status: 'Faturado', dataFaturamento: '2026-01-10', valorFaturado: 500, nf: '123' })).data;
  ped = d.pedidos.find(p => p.id === r.id);
  assert.equal(ped.comissoes.length, 2);
  assert.equal(R.r2(ped.comissoes.reduce((s, c) => s + c.valor, 0)), R.r2(500 * rep.comissao / 100));
  assert.equal(ped.comissoes[0].venc, R.addDays('2026-01-10', 30 + rep.diasComissao));
  // baixa com valor diferente
  d = (await ok('POST', '/api/comissoes/receber', { data: '2026-03-01', parcelas: [{ pedidoId: r.id, n: 1, valor: 10 }] })).data;
  ped = d.pedidos.find(p => p.id === r.id);
  assert.equal(ped.comissoes[0].recebida, true); assert.equal(ped.comissoes[0].valorRecebido, 10);
  assert.equal((await req('POST', '/api/comissoes/receber', { parcelas: [{ pedidoId: r.id, n: 1 }] })).status, 400, 'não baixa duas vezes');
  // com comissão recebida: não edita, não cancela
  assert.equal((await req('POST', '/api/pedidos', { ...base, id: r.id })).status, 400);
  assert.equal((await req('POST', `/api/pedidos/${r.id}/status`, { status: 'Cancelado' })).status, 400);
  assert.equal((await ok('POST', `/api/pedidos/${r.id}/status`, { status: 'Entregue' })).data.pedidos.find(p => p.id === r.id).status, 'Entregue');
  // estorna e então pode cancelar (comissões somem)
  await ok('POST', '/api/comissoes/estornar', { pedidoId: r.id, n: 1 });
  d = (await ok('POST', `/api/pedidos/${r.id}/status`, { status: 'Cancelado' })).data;
  ped = d.pedidos.find(p => p.id === r.id);
  assert.equal(ped.comissoes.length, 0); assert.ok(ped.historico.length >= 3);
  await ok('DELETE', '/api/pedidos/' + r.id);
});

test('oportunidade ganha vira pedido; perda exige motivo', async () => {
  const d = (await ok('GET', '/api/data')).data;
  const o = d.oportunidades.find(x => x.etapa === 'Proposta');
  assert.equal((await req('POST', `/api/oportunidades/${o.id}/etapa`, { etapa: 'Perdida' })).status, 400);
  await ok('POST', `/api/oportunidades/${o.id}/etapa`, { etapa: 'Negociação' });
  const prod = d.produtos.find(p => p.representadaId === o.representadaId);
  const r = await ok('POST', '/api/pedidos', { clienteId: o.clienteId, representadaId: o.representadaId, oportunidadeId: o.id, itens: [{ produtoId: prod.id, qtd: 2, preco: 50 }] });
  const op = r.data.oportunidades.find(x => x.id === o.id);
  assert.equal(op.etapa, 'Ganha'); assert.equal(op.pedidoId, r.id); assert.equal(op.valor, 100);
});

test('atividade: concluir e já agendar a próxima', async () => {
  const d = (await ok('GET', '/api/data')).data;
  const a = d.atividades.find(x => x.status === 'Pendente');
  const r = await ok('POST', `/api/atividades/${a.id}/concluir`, { resultado: 'Pediu retorno', proxima: { tipo: 'Visita', data: '2030-01-01' } });
  assert.equal(r.data.atividades.find(x => x.id === a.id).status, 'Concluída');
  const p = r.data.atividades.find(x => x.id === r.proximaId);
  assert.equal(p.clienteId, a.clienteId); assert.equal(p.tipo, 'Visita');
  assert.equal((await req('PUT', '/api/crud/atividades', { tipo: 'Ligação', assunto: 'x', data: '' })).status, 400, 'data obrigatória');
});

test('cadastros, importação de tabela e exclusão protegida', async () => {
  const rep = await ok('PUT', '/api/crud/representadas', { nome: 'Nova Fábrica', comissao: '7,5', baseComissao: 'Faturamento' });
  assert.equal(rep.data.representadas.find(r => r.id === rep.id).comissao, 7.5);
  assert.equal((await req('PUT', '/api/crud/representadas', { nome: 'X', comissao: 150 })).status, 400);
  let r = await ok('POST', '/api/produtos/importar', { representadaId: rep.id, linhas: [{ codigo: 'A1', descricao: 'Prod A', preco: 10 }, { codigo: 'B2', descricao: 'Prod B', preco: 20, ipi: 5 }] });
  assert.deepEqual([r.novos, r.atualizados], [2, 0]);
  r = await ok('POST', '/api/produtos/importar', { representadaId: rep.id, linhas: [{ codigo: 'a1', descricao: 'Prod A novo', preco: 11 }] });
  assert.deepEqual([r.novos, r.atualizados], [0, 1], 'atualiza pelo código (sem diferenciar maiúsculas)');
  assert.equal(r.data.produtos.find(p => p.representadaId === rep.id && p.codigo === 'A1').preco, 11);
  assert.equal((await req('PUT', '/api/crud/produtos', { representadaId: rep.id, codigo: 'B2', descricao: 'dup' })).status, 400, 'código duplicado');
  assert.equal((await req('DELETE', '/api/crud/representadas/' + rep.id)).status, 400, 'tem produtos');
  const d = r.data, cliComPedido = d.pedidos[0].clienteId;
  assert.equal((await req('DELETE', '/api/crud/clientes/' + cliComPedido)).status, 400);
  assert.equal((await req('PUT', '/api/crud/nada', {})).status, 404);
});

test('backup, restauração e senha', async () => {
  const b = (await ok('GET', '/api/backup')).backup;
  const n = b.pedidos.length;
  await ok('POST', '/api/reset', { modo: 'vazio' });
  assert.equal((await ok('GET', '/api/data')).data.pedidos.length, 0);
  await ok('POST', '/api/restore', { backup: b });
  assert.equal((await ok('GET', '/api/data')).data.pedidos.length, n);
  const s = await ok('POST', '/api/senha', { atual: 'admin123', nova: 'nova-senha-9' });
  assert.equal((await req('GET', '/api/data')).status, 401, 'token antigo cai');
  TK = s.token; await ok('GET', '/api/data');
});
