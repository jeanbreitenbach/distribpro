/* Testes de ponta a ponta da API. Rodar com:  npm test   (ou: node --test tests/)
 * Sobe o servidor numa porta livre com um banco temporário e dados de demonstração. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');

const RAIZ = path.join(__dirname, '..');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'distribpro-test-'));
const DB_FILE = path.join(DIR, 'teste.db');
let PORTA, srv, saidaErro = '';
const T = {}; // tokens por perfil

const portaLivre = () => new Promise(ok => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
async function req(metodo, url, corpo, token) {
  const r = await fetch(`http://127.0.0.1:${PORTA}${url}`, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const txt = await r.text(); let json; try { json = JSON.parse(txt); } catch { json = { _texto: txt }; }
  return { status: r.status, json, headers: r.headers };
}
const login = async (email, senha) => (await req('POST', '/api/login', { email, senha })).json.token;
const dados = async tok => (await req('GET', '/api/data', undefined, tok)).json.data;
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

async function iniciar(env = {}) {
  srv = spawn(process.execPath, [path.join(RAIZ, 'server.js')], { env: { ...process.env, PORT: String(PORTA), DB_FILE, BACKUP_DIR: path.join(DIR, 'bk'), TZ: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', d => { saidaErro += d; });
  await new Promise((ok, falha) => { srv.stdout.on('data', d => { if (String(d).includes('rodando em')) ok(); }); srv.on('exit', c => falha(new Error('servidor saiu ' + c + saidaErro))); });
}
const parar = () => new Promise(ok => { srv.once('exit', ok); srv.kill('SIGTERM'); });

before(async () => {
  PORTA = await portaLivre(); await iniciar();
  T.admin = await login('admin@distribpro.local', 'admin123');
  T.vend = await login('carlos@distribpro.local', '123456');
  T.vend2 = await login('ana@distribpro.local', '123456');
  T.cli = await login('compras@bompreco.com.br', '123456');
});
after(async () => { if (srv && srv.exitCode === null) await parar(); fs.rmSync(DIR, { recursive: true, force: true }); });

/* ---------------- Autenticação ---------------- */
test('login, sessão e senha', async () => {
  assert.ok(T.admin && T.vend && T.vend2 && T.cli, 'todos os perfis entram');
  assert.equal((await req('POST', '/api/login', { email: 'admin@distribpro.local', senha: 'errada' })).status, 401);
  assert.equal((await req('GET', '/api/data')).status, 401, 'sem token');
  assert.equal((await req('GET', '/api/data', undefined, T.admin + 'x')).status, 401, 'token adulterado');
  assert.equal((await req('GET', '/api/health')).json.status, 'ok');
  // troca de senha invalida o token antigo
  const t = await login('ana@distribpro.local', '123456');
  assert.equal((await req('POST', '/api/senha', { atual: '123456', nova: 'nova-senha-1' }, t)).status, 200);
  assert.equal((await req('GET', '/api/data', undefined, t)).status, 401);
  T.vend2 = await login('ana@distribpro.local', 'nova-senha-1'); assert.ok(T.vend2);
});
test('bloqueio após muitas tentativas de login', async () => {
  for (let i = 0; i < 8; i++) await req('POST', '/api/login', { email: 'x@x.com', senha: 'y' });
  assert.equal((await req('POST', '/api/login', { email: 'x@x.com', senha: 'y' })).status, 429);
});

/* ---------------- Visão por perfil ---------------- */
test('cada perfil só vê o que pode', async () => {
  const a = await dados(T.admin), v = await dados(T.vend), c = await dados(T.cli);
  assert.ok(a.usuarios.length >= 4 && a.usuarios.every(u => !u.senha), 'admin vê usuários sem hash de senha');
  assert.ok(v.clientes.every(x => x.vendedorId === 'v1'), 'vendedor só vê a carteira');
  assert.ok(v.produtos.every(p => p.custo === undefined) && c.produtos.every(p => p.custo === undefined), 'custo oculto');
  for (const col of ['usuarios', 'pagar', 'fornecedores', 'compras', 'bancos', 'extrato', 'movimentos']) { assert.equal(v[col].length, 0, 'vendedor sem ' + col); assert.equal(c[col].length, 0, 'cliente sem ' + col); }
  assert.ok(c.clientes.length === 1 && c.pedidos.every(p => p.clienteId === 'cl1') && c.titulos.every(t => t.clienteId === 'cl1'));
  assert.ok(v.visitas.every(x => x.vendedorId === 'v1') && c.visitas.length === 0);
});
test('permissões de escrita', async () => {
  const proibidos = [['PUT', '/api/crud/produtos', { nome: 'x' }], ['PUT', '/api/pagar', { descricao: 'x', valor: 1, vencimento: '2026-12-01' }], ['POST', '/api/compras', {}],
    ['POST', '/api/estoque', { produtoId: 'p1', tipo: 'Entrada', qtd: 1 }], ['GET', '/api/backup'], ['POST', '/api/reset', { modo: 'vazio' }], ['PUT', '/api/empresa', { nome: 'x' }], ['PUT', '/api/crud/usuarios', { email: 'a@a.com' }]];
  for (const [m, u, b] of proibidos) for (const tok of [T.vend, T.cli]) assert.equal((await req(m, u, b, tok)).status, 403, `${m} ${u}`);
  assert.equal((await req('PUT', '/api/visitas', { clienteId: 'cl1', data: '2026-12-01' }, T.cli)).status, 403);
  // vendedor não acessa cliente de outro
  assert.match((await req('POST', '/api/pedidos', { pedido: { clienteId: 'cl2', condicaoId: 'c1', itens: [{ produtoId: 'p1', qtd: 1, preco: 1 }] } }, T.vend)).json.erro, /carteira/);
  assert.equal((await req('PUT', '/api/crud/clientes', { id: 'cl2', razao: 'Hack' }, T.vend)).status, 403);
});

/* ---------------- Pedidos ---------------- */
test('fluxo do pedido: aprovar, faturar (estoque + títulos), estornar, NF-e', async () => {
  let a = await dados(T.admin); const est0 = a.produtos.find(p => p.id === 'p1').estoque;
  let r = await req('POST', '/api/pedidos', { pedido: { clienteId: 'cl1', condicaoId: 'c3', itens: [{ produtoId: 'p1', qtd: 10, preco: 8.9 }] }, aprovar: true }, T.vend);
  assert.equal(r.status, 200); const id = r.json.id;
  let p = r.json.data.pedidos.find(x => x.id === id);
  assert.equal(p.status, 'Aprovado'); assert.equal(p.vendedorId, 'v1'); assert.equal(p.data, hojeBR(), 'data do pedido no horário de Brasília');
  assert.equal((await req('POST', `/api/pedidos/${id}/status`, { status: 'Faturado' }, T.vend)).status, 403, 'vendedor não fatura');
  r = await req('POST', `/api/pedidos/${id}/status`, { status: 'Faturado', forcar: true }, T.admin); assert.equal(r.status, 200);
  a = r.json.data; p = a.pedidos.find(x => x.id === id);
  assert.equal(a.produtos.find(x => x.id === 'p1').estoque, est0 - 10, 'estoque baixado');
  const tit = a.titulos.filter(t => t.pedidoId === id);
  assert.equal(tit.length, 2, 'condição 28/56 gera 2 parcelas'); assert.equal(Math.round(tit.reduce((s, t) => s + t.valor, 0) * 100), 8900);
  r = await req('POST', `/api/pedidos/${id}/nfe`, undefined, T.admin); assert.equal(r.json.nfe.status, 'autorizada'); assert.equal(r.json.nfe.chave.length, 44);
  r = await req('POST', `/api/pedidos/${id}/status`, { status: 'Cancelado' }, T.admin); a = r.json.data;
  assert.equal(a.produtos.find(x => x.id === 'p1').estoque, est0, 'estoque estornado');
  assert.equal(a.titulos.filter(t => t.pedidoId === id).length, 0, 'títulos em aberto removidos');
});
test('aviso de estoque insuficiente ao faturar (409 e depois forçar)', async () => {
  const r0 = await req('POST', '/api/pedidos', { pedido: { clienteId: 'cl1', vendedorId: 'v1', condicaoId: 'c1', itens: [{ produtoId: 'p4', qtd: 99999, preco: 1 }] }, aprovar: true }, T.admin);
  const r = await req('POST', `/api/pedidos/${r0.json.id}/status`, { status: 'Faturado' }, T.admin);
  assert.equal(r.status, 409); assert.ok(r.json.avisos.some(x => /Estoque/.test(x)));
  assert.equal((await req('DELETE', `/api/pedidos/${r0.json.id}`, undefined, T.admin)).status, 200);
});
test('portal do cliente: preço da tabela é imposto pelo servidor', async () => {
  const r = await req('POST', '/api/pedidos', { pedido: { clienteId: 'cl5', itens: [{ produtoId: 'p1', qtd: 2, preco: 0.01, desc: 90 }], descontoGeral: 50, frete: -10 }, aprovar: true }, T.cli);
  const p = r.json.data.pedidos.find(x => x.id === r.json.id);
  assert.equal(p.clienteId, 'cl1'); assert.equal(p.status, 'Orçamento'); assert.equal(p.origem, 'Portal B2B');
  assert.deepEqual([p.itens[0].preco, p.itens[0].desc, p.descontoGeral, p.frete], [8.9, 0, 0, 0]);
  assert.equal((await req('POST', `/api/pedidos/${p.id}/status`, { status: 'Aprovado' }, T.cli)).status, 403);
  assert.equal((await req('POST', `/api/pedidos/${p.id}/status`, { status: 'Cancelado' }, T.cli)).status, 200);
});
test('pedido offline: reenvio com o mesmo idLocal não duplica', async () => {
  const b = { pedido: { idLocal: 'teste-idem-1', criadoOffline: true, clienteId: 'cl1', condicaoId: 'c1', itens: [{ produtoId: 'p2', qtd: 1, preco: 14.5 }] } };
  const n0 = (await dados(T.admin)).pedidos.length;
  const a = await req('POST', '/api/pedidos', b, T.vend), c = await req('POST', '/api/pedidos', b, T.vend);
  assert.equal(a.json.id, c.json.id); assert.equal((await dados(T.admin)).pedidos.length, n0 + 1);
});
test('falha de validação não deixa nada pela metade (numeração sem buracos)', async () => {
  const seq = async () => Math.max(...(await dados(T.admin)).pedidos.map(p => p.numero));
  const n0 = await seq();
  const r = await req('POST', '/api/pedidos', { pedido: { clienteId: 'cl1', vendedorId: 'v1', condicaoId: 'nao-existe', itens: [{ produtoId: 'p1', qtd: 1, preco: 1 }] } }, T.admin);
  assert.equal(r.status, 400);
  const ok = await req('POST', '/api/pedidos', { pedido: { clienteId: 'cl1', vendedorId: 'v1', condicaoId: 'c1', itens: [{ produtoId: 'p1', qtd: 1, preco: 1 }] } }, T.admin);
  assert.equal(ok.json.data.pedidos.find(p => p.id === ok.json.id).numero, n0 + 1);
});

/* ---------------- Cadastros ---------------- */
test('cadastros: criar, editar, ajuste de estoque e exclusão protegida', async () => {
  let r = await req('PUT', '/api/crud/produtos', { nome: 'Produto Teste', codigo: '9999', preco: '10,50', custo: 5, estoque: 10, estoqueMin: 2, unidade: 'UN', ativo: 'Sim' }, T.admin);
  const p = r.json.data.produtos.find(x => x.codigo === '9999'); assert.equal(p.preco, 10.5);
  r = await req('PUT', '/api/crud/produtos', { id: p.id, estoque: 25 }, T.admin);
  assert.equal(r.json.data.produtos.find(x => x.id === p.id).estoque, 25);
  assert.ok(r.json.data.movimentos.some(m => m.produtoId === p.id && m.tipo === 'Ajuste'), 'ajuste gera movimentação');
  assert.equal((await req('DELETE', `/api/crud/produtos/${p.id}`, undefined, T.admin)).status, 200);
  assert.match((await req('DELETE', '/api/crud/clientes/cl1', undefined, T.admin)).json.erro, /em uso/);
  assert.equal((await req('PUT', '/api/crud/produtos', { nome: '' }, T.admin)).status, 400);
  // vendedor cadastra cliente na própria carteira
  r = await req('PUT', '/api/crud/clientes', { razao: 'Cliente do Vendedor', vendedorId: 'v2' }, T.vend);
  assert.equal(r.json.data.clientes.find(c => c.razao === 'Cliente do Vendedor').vendedorId, 'v1');
  // usuários
  assert.match((await req('PUT', '/api/crud/usuarios', { nome: 'X', email: 'carlos@distribpro.local', papel: 'admin', senha: '12345678' }, T.admin)).json.erro, /já cadastrado/);
  assert.match((await req('PUT', '/api/crud/usuarios', { nome: 'X', email: 'novo@x.com', papel: 'vendedor', senha: '12345678' }, T.admin)).json.erro, /vendedor vinculado/);
  r = await req('PUT', '/api/crud/usuarios', { nome: 'Rafael', email: 'rafael@distribpro.local', papel: 'vendedor', vendedorId: 'v3', senha: 'senha123', ativo: 'Sim' }, T.admin);
  assert.equal(r.status, 200); assert.ok(await login('rafael@distribpro.local', 'senha123'));
});

/* ---------------- Compras / contas a pagar ---------------- */
test('compra (como na importação de XML): fornecedor e produto novos, duplicatas, custo médio, NF repetida', async () => {
  const chave = '35261199888777000166550010000000991000000010';
  const corpo = { novoFornecedor: { razao: 'Fornecedor XML Ltda', cnpj: '99.888.777/0001-66', uf: 'SP' }, nf: '991', serie: '1', chave, emissao: '2026-11-20', frete: 20, totalNF: 520,
    duplicatas: [{ numero: '001', vencimento: '2026-12-20', valor: 260 }, { numero: '002', vencimento: '2027-01-19', valor: 260 }],
    itens: [{ produtoId: 'p1', qtd: 60, custo: 5, cProd: 'A1', xProd: 'REFRI FD6', qtdNF: 10, unNF: 'FD', fator: 6 },
      { novoProduto: { nome: 'Produto Novo XML', ean: '7890000099991', ncm: '22029900', unidade: 'UN', preco: 4 }, qtd: 100, custo: 2, cProd: 'B2', xProd: 'NOVO' }] };
  const a0 = await dados(T.admin); const p1 = a0.produtos.find(p => p.id === 'p1');
  let r = await req('POST', '/api/compras', corpo, T.admin); assert.equal(r.status, 200, JSON.stringify(r.json));
  const a = r.json.data, c = a.compras.find(x => x.id === r.json.id), f = a.fornecedores.find(x => x.id === c.fornecedorId);
  assert.ok(f && f.vinculos.A1.produtoId === 'p1' && f.vinculos.A1.fator === 6, 'fornecedor criado e vínculo memorizado');
  const novo = a.produtos.find(p => p.nome === 'Produto Novo XML'); assert.equal(novo.estoque, 100);
  assert.equal(a.produtos.find(p => p.id === 'p1').estoque, p1.estoque + 60);
  const custoEsp = Math.round((p1.estoque * p1.custo + 60 * 5 * (1 + 20 / 500)) / (p1.estoque + 60) * 100) / 100;
  assert.equal(a.produtos.find(p => p.id === 'p1').custo, custoEsp, 'custo médio com rateio do frete');
  assert.deepEqual(a.pagar.filter(t => t.compraId === c.id).map(t => [t.vencimento, t.valor]), [['2026-12-20', 260], ['2027-01-19', 260]]);
  assert.match((await req('POST', '/api/compras', { ...corpo, novoFornecedor: undefined, fornecedorId: f.id }, T.admin)).json.erro, /já foi lançada/);
  r = await req('POST', `/api/compras/${c.id}/cancelar`, undefined, T.admin);
  assert.equal(r.json.data.produtos.find(p => p.id === 'p1').estoque, p1.estoque); assert.equal(r.json.data.pagar.filter(t => t.compraId === c.id).length, 0);
});
test('contas a pagar: parcelar, repetir mensal (fim de mês), baixa, estorno e exclusão', async () => {
  let r = await req('PUT', '/api/pagar', { descricao: 'Teste parcelado', valor: '100', vencimento: '2026-12-10', modo: 'parcelar', parcelas: 3 }, T.admin);
  assert.deepEqual(r.json.data.pagar.filter(t => t.descricao === 'Teste parcelado').map(t => t.valor), [33.33, 33.33, 33.34]);
  r = await req('PUT', '/api/pagar', { descricao: 'Aluguel teste', valor: 1000, vencimento: '2027-01-31', modo: 'repetir', parcelas: 3 }, T.admin);
  assert.deepEqual(r.json.data.pagar.filter(t => t.descricao === 'Aluguel teste').map(t => t.vencimento), ['2027-01-31', '2027-02-28', '2027-03-31']);
  const t = r.json.data.pagar.find(x => x.descricao === 'Aluguel teste');
  r = await req('POST', `/api/pagar/${t.id}/baixa`, { pago: true, valorPago: 1010, forma: 'PIX' }, T.admin);
  assert.equal(r.json.data.pagar.find(x => x.id === t.id).valorPago, 1010);
  assert.match((await req('DELETE', `/api/pagar/${t.id}`, undefined, T.admin)).json.erro, /Estorne/);
  await req('POST', `/api/pagar/${t.id}/baixa`, { pago: false }, T.admin);
  assert.equal((await req('DELETE', `/api/pagar/${t.id}`, undefined, T.admin)).status, 200);
  assert.equal((await req('PUT', '/api/pagar', { descricao: 'x', valor: 0, vencimento: '2026-12-01' }, T.admin)).status, 400);
});

/* ---------------- Bancos / conciliação ---------------- */
test('extrato: importação sem duplicar e conciliação (receber, diferença, avulso, desfazer)', async () => {
  let a = await dados(T.admin); const tit = a.titulos.find(t => !t.pago);
  const lanc = [{ data: '2026-11-20', valor: tit.valor, descricao: 'PIX RECEBIDO', fitid: 'T1' }, { data: '2026-11-20', valor: -9.9, descricao: 'TARIFA', fitid: 'T2' }, { data: '2026-11-21', valor: tit.valor + 5, descricao: 'PIX', fitid: 'T3' }];
  let r = await req('POST', '/api/extrato/importar', { bancoId: 'b1', lancamentos: lanc }, T.admin); assert.deepEqual(r.json.importacao, { novos: 3, duplicados: 0, ignorados: 0 });
  r = await req('POST', '/api/extrato/importar', { bancoId: 'b1', lancamentos: lanc }, T.admin); assert.equal(r.json.importacao.duplicados, 3);
  a = r.json.data; const e1 = a.extrato.find(e => e.fitid === 'T1'), e2 = a.extrato.find(e => e.fitid === 'T2'), e3 = a.extrato.find(e => e.fitid === 'T3');
  assert.equal((await req('POST', `/api/extrato/${e1.id}/conciliar`, { tipo: 'pagar', ids: [tit.id] }, T.admin)).status, 400, 'crédito não concilia com pagar');
  r = await req('POST', `/api/extrato/${e1.id}/conciliar`, { tipo: 'receber', ids: [tit.id] }, T.admin);
  const tb = r.json.data.titulos.find(t => t.id === tit.id); assert.ok(tb.pago && tb.dataPagamento === '2026-11-20');
  assert.match((await req('POST', `/api/extrato/${e3.id}/conciliar`, { tipo: 'receber', ids: [tit.id] }, T.admin)).json.erro, /já está conciliado/);
  r = await req('POST', `/api/extrato/${e2.id}/conciliar`, { tipo: 'avulso', categoria: 'Tarifas bancárias' }, T.admin);
  assert.ok(r.json.data.pagar.some(t => t.origem === 'extrato' && t.valor === 9.9 && t.pago));
  r = await req('POST', `/api/extrato/${e1.id}/desfazer`, undefined, T.admin); assert.equal(r.json.data.titulos.find(t => t.id === tit.id).pago, false);
  r = await req('POST', `/api/extrato/${e3.id}/conciliar`, { tipo: 'receber', ids: [tit.id] }, T.admin); assert.equal(r.status, 409, 'diferença de valor pede confirmação');
  r = await req('POST', `/api/extrato/${e3.id}/conciliar`, { tipo: 'receber', ids: [tit.id], forcar: true }, T.admin);
  assert.equal(r.json.data.titulos.find(t => t.id === tit.id).valorRecebido, Math.round((tit.valor + 5) * 100) / 100);
  assert.match((await req('DELETE', '/api/crud/bancos/b1', undefined, T.admin)).json.erro, /em uso/);
});

/* ---------------- Visitas ---------------- */
test('visitas: agendar, check-in com distância, pedido ligado, encerrar, roteiro sem duplicar', async () => {
  const v = await dados(T.vend); const cli = v.clientes.find(c => c.lat);
  let r = await req('PUT', '/api/visitas', { clienteId: cli.id, data: '2026-12-02' }, T.vend); const id = r.json.id;
  assert.equal((await req('POST', `/api/visitas/${id}/checkin`, {}, T.vend2)).status, 404, 'outro vendedor não mexe');
  r = await req('POST', `/api/visitas/${id}/checkin`, { lat: cli.lat + 0.009, lng: cli.lng }, T.vend);
  const ck = r.json.data.visitas.find(x => x.id === id).checkin; assert.ok(ck.distancia > 950 && ck.distancia < 1050, 'distância ~1 km: ' + ck.distancia);
  await req('POST', `/api/visitas/${id}/checkin`, { lat: 0, lng: 0 }, T.vend);
  assert.equal((await dados(T.vend)).visitas.find(x => x.id === id).checkin.distancia, ck.distancia, 'reenvio mantém o primeiro check-in');
  assert.equal((await req('POST', `/api/visitas/${id}/encerrar`, { realizada: true }, T.vend)).status, 400, 'sem pedido exige motivo');
  r = await req('POST', '/api/pedidos', { pedido: { visitaId: id, clienteId: cli.id, condicaoId: 'c1', itens: [{ produtoId: 'p1', qtd: 1, preco: 8.9 }] } }, T.vend);
  r = await req('POST', `/api/visitas/${id}/encerrar`, { realizada: true }, T.vend);
  const vs = r.json.data.visitas.find(x => x.id === id); assert.equal(vs.status, 'Realizada'); assert.equal(vs.resultado, 'Pedido realizado'); assert.ok(vs.pedidoId);
  const g1 = (await req('POST', '/api/visitas/gerar', { de: '2026-12-07', ate: '2026-12-20' }, T.vend)).json.criadas;
  const g2 = (await req('POST', '/api/visitas/gerar', { de: '2026-12-07', ate: '2026-12-20' }, T.vend)).json.criadas;
  assert.ok(g1 > 0); assert.equal(g2, 0);
});

/* ---------------- Robustez ---------------- */
test('dados malformados nunca derrubam o servidor (sem erro 500)', async () => {
  const lixo = [null, 'texto', 123, [], { id: { $ne: 1 } }, { itens: 'x' }, { pedido: null }, { pedido: { itens: [null, { produtoId: {}, qtd: 'abc' }] } }, { lancamentos: [null, 1] }, { ids: 'x' }, { duplicatas: [{}] }];
  const rotas = [['POST', '/api/pedidos'], ['POST', '/api/pedidos/x/status'], ['POST', '/api/pedidos/x/nfe'], ['PUT', '/api/crud/produtos'], ['PUT', '/api/crud/nada'], ['DELETE', '/api/crud/produtos/x'],
    ['POST', '/api/compras'], ['PUT', '/api/pagar'], ['POST', '/api/pagar/x/baixa'], ['POST', '/api/extrato/importar'], ['POST', '/api/extrato/x/conciliar'], ['PUT', '/api/visitas'],
    ['POST', '/api/visitas/gerar'], ['POST', '/api/visitas/x/checkin'], ['POST', '/api/visitas/ordem'], ['POST', '/api/estoque'], ['POST', '/api/restore'], ['POST', '/api/senha'], ['POST', '/api/login']];
  for (const [m, u] of rotas) for (const corpo of lixo) {
    const r = await req(m, u, corpo, T.admin);
    assert.notEqual(r.status, 500, `${m} ${u} com ${JSON.stringify(corpo)} → ${JSON.stringify(r.json)}`);
  }
  const bruto = await fetch(`http://127.0.0.1:${PORTA}/api/pedidos`, { method: 'POST', headers: { Authorization: 'Bearer ' + T.admin }, body: '{json quebrado' });
  assert.equal(bruto.status, 400);
  assert.equal((await dados(T.admin)).empresa.nome.length > 0, true, 'servidor segue de pé');
});
test('arquivos estáticos, segurança e app instalável', async () => {
  const r = await fetch(`http://127.0.0.1:${PORTA}/`); assert.equal(r.status, 200); assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match((await fetch(`http://127.0.0.1:${PORTA}/manifest.webmanifest`)).headers.get('content-type'), /manifest\+json/);
  assert.equal((await fetch(`http://127.0.0.1:${PORTA}/sw.js`)).headers.get('cache-control'), 'no-cache');
  for (const f of ['app.js', 'financeiro.js', 'bancos.js', 'visitas.js', 'offline.js', 'regras.js', 'icons/icon-192.png']) assert.equal((await fetch(`http://127.0.0.1:${PORTA}/${f}`)).status, 200, f);
  const trav = await new Promise(ok => require('node:http').get({ host: '127.0.0.1', port: PORTA, path: '/../server.js' }, res => { let d = ''; res.on('data', x => d += x); res.on('end', () => ok(d)); }));
  assert.ok(!trav.includes('createServer'), 'não expõe o código do servidor');
});

/* ---------------- Catálogo público ---------------- */
test('catálogo público: página, preço e estoque sem login, sem custo', async () => {
  const pg = await fetch(`http://127.0.0.1:${PORTA}/catalogo`); const html = await pg.text();
  assert.equal(pg.status, 200); assert.match(html, /catalogo\/catalogo\.js/);
  assert.match(await (await fetch(`http://127.0.0.1:${PORTA}/catalogo-dados.js`)).text(), /5548988147567/);
  const img = await fetch(`http://127.0.0.1:${PORTA}/catalogo/img/tino.jpg`); assert.equal(img.headers.get('content-type'), 'image/jpeg');
  const r = await req('GET', '/api/catalogo');
  assert.equal(r.status, 200); assert.equal(r.json.itens.length, require('../lib/catalogo').PRODUTOS.length);
  for (const i of r.json.itens) { assert.ok(i.preco > 0 && i.estoque >= 0 && i.situacao); assert.equal(i.custo, undefined); assert.equal(i.id, undefined); }
  assert.equal(r.json.itens.find(i => i.codigo === 'IP-GOUR-800').situacao, 'Últimas unidades');
  assert.equal((await req('POST', '/api/catalogo/importar', {}, T.vend)).status, 403);
  assert.equal((await req('POST', '/api/catalogo/importar', {}, T.admin)).json.criados, 0, 'demo já tem os itens do catálogo');
});

/* ---------------- Backup, restauração e operação ---------------- */
test('backup e restauração', async () => {
  const bk = (await req('GET', '/api/backup', undefined, T.admin)).json.backup;
  await req('PUT', '/api/empresa', { nome: 'Nome Alterado' }, T.admin);
  assert.equal((await dados(T.admin)).empresa.nome, 'Nome Alterado');
  assert.equal((await req('POST', '/api/restore', { backup: bk }, T.admin)).status, 200);
  const a = await dados(T.admin); assert.notEqual(a.empresa.nome, 'Nome Alterado'); assert.equal(a.pedidos.length, bk.pedidos.length);
  assert.equal((await req('POST', '/api/restore', { backup: { empresa: {} } }, T.admin)).status, 400);
});
test('backup automático diário e reinício sem perda de dados', async () => {
  const arq = path.join(DIR, 'bk', `distribpro-${hojeBR()}.db`);
  for (let i = 0; i < 40 && !fs.existsSync(arq); i++) await new Promise(ok => setTimeout(ok, 250));
  assert.ok(fs.existsSync(arq) && fs.statSync(arq).size > 10000, 'backup do dia criado');
  const n = (await dados(T.admin)).pedidos.length;
  await parar(); await iniciar();
  T.admin = await login('admin@distribpro.local', 'admin123');
  assert.equal((await dados(T.admin)).pedidos.length, n, 'dados mantidos após reinício');
});
test('redefinir senha pela linha de comando com o servidor ligado', async () => {
  const out = execFileSync(process.execPath, [path.join(RAIZ, 'server.js'), 'redefinir-senha', 'admin@distribpro.local', 'SenhaNova#2026'], { env: { ...process.env, DB_FILE } }).toString();
  assert.match(out, /redefinida/);
  assert.equal((await req('GET', '/api/data', undefined, T.admin)).status, 401, 'sessões antigas encerradas');
  assert.ok(await login('admin@distribpro.local', 'SenhaNova#2026'), 'servidor reconhece a senha nova sem reiniciar');
});
test('nenhum erro inesperado no log do servidor', () => {
  assert.equal(saidaErro.trim(), '', saidaErro);
});
