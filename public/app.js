/* DistribPro — front-end */
'use strict';
const $ = s => document.querySelector(s);
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const today = Regras.hoje, addDays = Regras.addDays;
const fdate = d => d ? d.slice(0, 10).split('-').reverse().join('/') : '';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400); }

/* ================== ESTADO / API ================== */
let db = null, token = null, page = '', state = {}, draft = null;
try { token = localStorage.getItem('dp_token'); } catch (e) { }
const byId = (col, id) => (db[col] || []).find(x => x.id === id);
const papel = () => db.me.papel;
const isAdmin = () => papel() === 'admin', isVend = () => papel() === 'vendedor', isCli = () => papel() === 'cliente';
const precoCliente = (p, cli) => Regras.precoCliente(db, p, cli);
const totalItens = Regras.totalItens, totalPedido = Regras.totalPedido, vendaValida = Regras.vendaValida;
const emAberto = cid => Regras.emAberto(db, cid);
const STATUS = Regras.STATUS, BAIXA = Regras.BAIXA;
const STATUS_BADGE = { 'Orçamento': 'b-mut', 'Aprovado': '', 'Em separação': 'b-warn', 'Faturado': 'b-ok', 'Entregue': 'b-ok', 'Cancelado': 'b-bad' };

async function api(method, url, body) {
  let r, j;
  try {
    r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    j = await r.json();
  } catch (e) { throw Object.assign(new Error('Não foi possível falar com o servidor. Verifique sua conexão.'), { status: 0 }); }
  if (r.status === 401 && url !== '/api/login') { sair(true); throw Object.assign(new Error(j.erro), { status: 401 }); }
  if (!r.ok) throw Object.assign(new Error(j.erro || 'Erro'), { status: r.status, data: j });
  if (j.data) db = j.data;
  return j;
}
/** Executa uma ação no servidor, mostra erros e re-renderiza. */
async function acao(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); render(); return r; }
  catch (e) { if (e.status !== 401) alert(e.message); return null; }
}
function setToken(t) { token = t; try { t ? localStorage.setItem('dp_token', t) : localStorage.removeItem('dp_token'); } catch (e) { } }
function sair(expirou) { setToken(null); db = null; closeModal(); telaLogin(expirou ? 'Sua sessão expirou. Entre novamente.' : ''); }

/* ================== LOGIN ================== */
function telaLogin(msg) {
  $('#root').innerHTML = `<div class="login-wrap"><div class="card login">
    <div class="brand"><span>D</span>DistribPro</div>
    <form id="lg" onsubmit="event.preventDefault();entrar()">
      <label>E-mail</label><input name="email" type="email" autocomplete="username" required autofocus>
      <label style="margin-top:12px">Senha</label><input name="senha" type="password" autocomplete="current-password" required>
      <div id="lgErr" style="color:var(--bad);font-size:13px;min-height:20px;margin-top:8px">${esc(msg || '')}</div>
      <button class="btn pri" style="width:100%;justify-content:center;margin-top:6px">Entrar</button>
    </form>
    <p class="hint" style="margin-top:16px">Gestão para distribuidoras · equipe interna, vendedores externos e portal do cliente.</p>
  </div></div>`;
}
async function entrar() {
  const f = Object.fromEntries(new FormData($('#lg')));
  try { const r = await api('POST', '/api/login', f); setToken(r.token); iniciarApp(); }
  catch (e) { $('#lgErr').textContent = e.message; }
}

/* ================== LAYOUT / NAV ================== */
function pages() {
  if (isCli()) return [['sep', 'Portal do cliente'], ['catalogo', '🛒', 'Fazer pedido'], ['pedidos', '🧾', 'Meus pedidos'], ['financeiro', '💰', 'Meus boletos'], ['conta', '👤', 'Minha conta']];
  const p = [['sep', 'Vendas'], ['dashboard', '📊', 'Painel'], ['pedidos', '🧾', 'Pedidos'], ['catalogo', '🛒', 'Catálogo / Novo pedido'], ['clientes', '🏪', isVend() ? 'Minha carteira' : 'Clientes']];
  if (isAdmin()) p.push(['vendedores', '🧑‍💼', 'Vendedores']);
  p.push(['sep', 'Operação'], ['produtos', '📦', 'Produtos']);
  if (isAdmin()) p.push(['estoque', '🏷️', 'Estoque']);
  p.push(['financeiro', '💰', 'Contas a receber'], ['sep', 'Gestão'], ['relatorios', '📈', 'Relatórios']);
  if (isAdmin()) p.push(['tabelas', '💲', 'Tabelas e condições'], ['usuarios', '🔐', 'Usuários e acessos'], ['config', '⚙️', 'Configurações']);
  p.push(['conta', '👤', 'Minha conta']);
  return p;
}
function iniciarApp() {
  $('#root').innerHTML = `<div class="app"><aside id="side"><div class="brand"><span>D</span>DistribPro</div><nav id="nav"></nav>
    <div class="user-box"><b>${esc(db.me.nome)}</b>${{ admin: 'Administrador', vendedor: 'Vendedor', cliente: 'Cliente' }[papel()]}<br><a style="cursor:pointer;color:var(--side-text);text-decoration:underline" onclick="sair()">Sair</a></div></aside>
    <main><div class="top"><button class="btn menu-btn" onclick="$('#side').classList.toggle('open')">☰</button><h1 id="title"></h1><div id="topActions" class="row"></div></div><div id="view"></div></main></div>`;
  const h = location.hash.slice(1);
  page = pages().some(p => p[0] === h) ? h : (isCli() ? 'catalogo' : 'dashboard');
  render();
}
function renderNav() { $('#nav').innerHTML = pages().map(p => p[0] === 'sep' ? `<div class="sep">${p[1]}</div>` : `<a class="${page === p[0] ? 'active' : ''}" onclick="go('${p[0]}')"><span>${p[1]}</span>${p[2]}</a>`).join(''); }
function go(p) { page = p; state = {}; $('#side').classList.remove('open'); location.hash = p; render(); window.scrollTo(0, 0); }
function render() {
  if (!db || !$('#view')) return;
  renderNav(); $('#topActions').innerHTML = '';
  const pg = pages().find(x => x[0] === page); $('#title').textContent = pg ? pg[2] : '';
  (VIEWS[page] || VIEWS.dashboard)();
}
const setActions = html => $('#topActions').innerHTML = html;
function closeModal() { $('#modal').innerHTML = ''; }
function openModal(html, wide) { $('#modal').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`; }
const modalAberto = () => !!$('#modal').innerHTML;

/* ================== CRUD GENÉRICO ================== */
const opts = (col, lab) => () => (db[col] || []).map(x => [x.id, x[lab]]);
const simNao = () => [['Sim', 'Sim'], ['Não', 'Não']];
const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
const SCHEMAS = {
  produtos: { titulo: 'Produto', fields: [
    ['codigo', 'Código'], ['nome', 'Descrição', 'text', 'full'], ['categoria', 'Categoria'], ['marca', 'Marca'], ['unidade', 'Unidade', 'select', () => ['UN', 'CX', 'PCT', 'FD', 'KG', 'LT'].map(x => [x, x])],
    ['ean', 'EAN / Cód. barras'], ['ncm', 'NCM (8 dígitos)'], ['custo', 'Custo (R$)', 'number'], ['preco', 'Preço de venda (R$)', 'number'], ['estoque', 'Estoque atual', 'number'], ['estoqueMin', 'Estoque mínimo', 'number'], ['ativo', 'Ativo', 'select', simNao]] },
  clientes: { titulo: 'Cliente', fields: [
    ['razao', 'Razão social', 'text', 'full'], ['fantasia', 'Nome fantasia'], ['cnpj', 'CNPJ/CPF'], ['ie', 'Inscrição estadual'], ['telefone', 'Telefone'], ['email', 'E-mail'],
    ['cep', 'CEP'], ['logradouro', 'Logradouro', 'text', 'full'], ['numero', 'Número'], ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['uf', 'UF', 'select', () => UFS.map(x => [x, x])],
    ['vendedorId', 'Vendedor', 'select', opts('vendedores', 'nome'), 'admin'], ['tabelaId', 'Tabela de preço', 'select', opts('tabelas', 'nome')], ['condicaoId', 'Condição de pagamento', 'select', opts('condicoes', 'nome')],
    ['limite', 'Limite de crédito (R$)', 'number'], ['ativo', 'Ativo', 'select', simNao]] },
  vendedores: { titulo: 'Vendedor', fields: [['nome', 'Nome', 'text', 'full'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['comissao', 'Comissão (%)', 'number'], ['meta', 'Meta mensal (R$)', 'number'], ['ativo', 'Ativo', 'select', simNao]] },
  tabelas: { titulo: 'Tabela de preço', fields: [['nome', 'Nome', 'text', 'full'], ['ajuste', 'Ajuste sobre preço base (%) — negativo = desconto', 'number', 'full']] },
  condicoes: { titulo: 'Condição de pagamento', fields: [['nome', 'Nome', 'text', 'full'], ['parcelas', 'Dias das parcelas separados por vírgula (ex: 30,60,90)', 'text', 'full']] },
  usuarios: { titulo: 'Usuário', fields: [['nome', 'Nome', 'text', 'full'], ['email', 'E-mail (login)'], ['senha', 'Senha (deixe em branco para manter)', 'password'],
    ['papel', 'Perfil', 'select', () => [['admin', 'Administrador (acesso total)'], ['vendedor', 'Vendedor (só a carteira dele)'], ['cliente', 'Cliente (portal B2B)']]],
    ['vendedorId', 'Vendedor vinculado (se perfil Vendedor)', 'select', opts('vendedores', 'nome')], ['clienteId', 'Cliente vinculado (se perfil Cliente)', 'select', opts('clientes', 'razao')], ['ativo', 'Ativo', 'select', simNao]] },
};
const podeEditar = col => isAdmin() || (isVend() && col === 'clientes');
function editar(col, id) {
  const sc = SCHEMAS[col]; const obj = id ? byId(col, id) : {}; const ro = !podeEditar(col);
  const f = sc.fields.filter(x => !(x[4] === 'admin' && !isAdmin())).map(([k, l, t = 'text', x, o]) => {
    if (typeof x === 'function') { o = x; x = ''; }
    const v = obj[k] ?? '';
    const inp = t === 'select' ? `<select name="${k}" ${ro ? 'disabled' : ''}><option value=""></option>${o().map(([a, b]) => `<option value="${esc(a)}" ${a == v ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`
      : `<input name="${k}" type="${t}" ${t === 'number' ? 'step="any"' : ''} value="${t === 'password' ? '' : esc(v)}" ${ro ? 'readonly' : ''} ${t === 'password' ? 'autocomplete="new-password"' : ''}>`;
    return `<div class="${x || ''}"><label>${l}</label>${inp}</div>`;
  }).join('');
  openModal(`<h2>${ro ? '' : id ? 'Editar ' : 'Novo '}${sc.titulo.toLowerCase()}</h2><form id="frm" class="form ${ro ? 'ro' : ''}" onsubmit="event.preventDefault()">${f}</form>
   ${col === 'produtos' && id && !ro ? '<p class="hint">Alterar o estoque aqui gera uma movimentação de ajuste.</p>' : ''}
   <div class="actions">${id && isAdmin() ? `<button class="btn danger" onclick="excluir('${col}','${id}')">Excluir</button>` : ''}<span style="flex:1"></span>
   <button class="btn" onclick="closeModal()">${ro ? 'Fechar' : 'Cancelar'}</button>${ro ? '' : `<button class="btn pri" onclick="salvar('${col}','${id || ''}')">Salvar</button>`}</div>`);
}
async function salvar(col, id) {
  const body = Object.fromEntries(new FormData($('#frm'))); if (id) body.id = id;
  if (await acao(() => api('PUT', '/api/crud/' + col, body), 'Salvo com sucesso')) closeModal();
}
async function excluir(col, id) {
  if (!confirm('Excluir este registro?')) return;
  if (await acao(() => api('DELETE', `/api/crud/${col}/${id}`), 'Excluído')) closeModal();
}
function tabela(cols, rows, empty = 'Nenhum registro encontrado') {
  return `<div class="tbl-wrap"><table><thead><tr>${cols.map(c => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}</tr></thead><tbody>
  ${rows.length ? rows.map(r => `<tr ${r._click ? `style="cursor:pointer" onclick="${r._click}"` : ''}>${cols.map(c => `<td class="${c[2] || ''}">${c[1](r)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="muted" style="text-align:center;padding:30px">${empty}</td></tr>`}
  </tbody></table></div>`;
}
function filtroTexto(ph, key = 'q') { return `<input placeholder="${ph}" value="${esc(state[key] || '')}" oninput="state['${key}']=this.value;rerender()" id="f_${key}">`; }
function rerender() { const a = document.activeElement, id = a && a.id, pos = a && a.selectionStart; render(); if (id) { const e = document.getElementById(id); if (e) { e.focus(); try { e.setSelectionRange(pos, pos); } catch (_) { } } } }
const match = (q, ...xs) => !q || xs.join(' ').toLowerCase().includes(q.toLowerCase());
const selVendedor = () => isAdmin() ? `<select onchange="state.vd=this.value;render()"><option value="">Todos vendedores</option>${db.vendedores.map(v => `<option value="${v.id}" ${state.vd === v.id ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}</select>` : '';

/* ================== VIEWS ================== */
const VIEWS = {};

VIEWS.dashboard = () => {
  if (isCli()) return go('catalogo');
  setActions(`<button class="btn pri" onclick="novoPedido()">+ Novo pedido</button>`);
  const mes = today().slice(0, 7); const mesAnt = addDays(mes + '-01', -1).slice(0, 7);
  const vend = db.pedidos.filter(vendaValida);
  const vMes = vend.filter(p => (p.faturamento || p.data).startsWith(mes)), vAnt = vend.filter(p => (p.faturamento || p.data).startsWith(mesAnt));
  const tMes = vMes.reduce((s, p) => s + totalPedido(p), 0), tAnt = vAnt.reduce((s, p) => s + totalPedido(p), 0);
  const var_ = tAnt ? ((tMes / tAnt - 1) * 100) : 0;
  const abertos = db.pedidos.filter(p => Regras.ABERTOS.includes(p.status));
  const portal = abertos.filter(p => p.origem === 'Portal B2B' && p.status === 'Orçamento');
  const receber = db.titulos.filter(t => !t.pago); const venc = receber.filter(t => t.vencimento < today());
  const lucro = isAdmin() ? vMes.reduce((s, p) => s + p.itens.reduce((a, i) => { const pr = byId('produtos', i.produtoId); return a + i.qtd * (i.preco * (1 - (i.desc || 0) / 100) - (pr ? pr.custo : 0)); }, 0), 0) : 0;
  const meses = []; for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); meses.push(d.toISOString().slice(0, 7)); }
  const serie = meses.map(m => vend.filter(p => (p.faturamento || p.data).startsWith(m)).reduce((s, p) => s + totalPedido(p), 0));
  const mx = Math.max(...serie, 1); const W = 560, H = 200, bw = W / 6;
  const nomesMes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const chart = `<svg viewBox="0 0 ${W} ${H + 24}" width="100%" style="max-height:240px">${serie.map((v, i) => { const h = v / mx * (H - 24); return `<rect x="${i * bw + bw * .22}" y="${H - h}" width="${bw * .56}" height="${h}" rx="4" fill="var(--pri)" opacity="${i === 5 ? 1 : .55}"><title>${brl(v)}</title></rect><text x="${i * bw + bw / 2}" y="${H - h - 6}" text-anchor="middle">${v >= 1000 ? num(v / 1000, 1) + 'k' : num(v)}</text><text x="${i * bw + bw / 2}" y="${H + 16}" text-anchor="middle">${nomesMes[+meses[i].slice(5) - 1]}</text>` }).join('')}</svg>`;
  const lim = addDays(today(), -90); const tp = {};
  vend.filter(p => p.data >= lim).forEach(p => p.itens.forEach(i => tp[i.produtoId] = (tp[i.produtoId] || 0) + i.qtd * i.preco));
  const top = Object.entries(tp).sort((a, b) => b[1] - a[1]).slice(0, 6); const topMax = top[0] ? top[0][1] : 1;
  const baixo = db.produtos.filter(p => p.ativo !== 'Não' && p.estoque <= p.estoqueMin);
  const vendRank = db.vendedores.map(v => ({ v, t: vMes.filter(p => p.vendedorId === v.id).reduce((s, p) => s + totalPedido(p), 0) })).sort((a, b) => b.t - a.t);
  // clientes sem comprar há 30+ dias (oportunidade de positivação)
  const semCompra = db.clientes.filter(c => c.ativo !== 'Não').map(c => ({ c, ult: db.pedidos.filter(p => p.clienteId === c.id && vendaValida(p)).map(p => p.data).sort().pop() }))
    .filter(x => !x.ult || x.ult < addDays(today(), -30)).sort((a, b) => (a.ult || '').localeCompare(b.ult || '')).slice(0, 6);
  $('#view').innerHTML = `
  ${portal.length ? `<div class="card" style="margin-bottom:14px;border-color:var(--pri);cursor:pointer" onclick="state={};page='pedidos';state.st='Orçamento';render()">🛎️ <b>${portal.length} pedido(s) novo(s) pelo portal B2B</b> aguardando aprovação — ${brl(portal.reduce((s, p) => s + totalPedido(p), 0))}</div>` : ''}
  <div class="grid kpis">
    <div class="card kpi"><div class="l">Faturamento do mês</div><div class="v">${brl(tMes)}</div><div class="s" style="color:${var_ >= 0 ? 'var(--ok)' : 'var(--bad)'}">${var_ >= 0 ? '▲' : '▼'} ${num(Math.abs(var_), 1)}% vs mês anterior</div></div>
    <div class="card kpi"><div class="l">Pedidos faturados (mês)</div><div class="v">${vMes.length}</div><div class="s">Ticket médio ${brl(vMes.length ? tMes / vMes.length : 0)}</div></div>
    ${isAdmin() ? `<div class="card kpi"><div class="l">Margem bruta (mês)</div><div class="v">${brl(lucro)}</div><div class="s">${tMes ? num(lucro / tMes * 100, 1) : 0}% sobre vendas</div></div>` : ''}
    <div class="card kpi" style="cursor:pointer" onclick="go('pedidos')"><div class="l">Pedidos em aberto</div><div class="v">${abertos.length}</div><div class="s">${brl(abertos.reduce((s, p) => s + totalPedido(p), 0))} em carteira</div></div>
    <div class="card kpi" style="cursor:pointer" onclick="go('financeiro')"><div class="l">A receber</div><div class="v">${brl(receber.reduce((s, t) => s + t.valor, 0))}</div><div class="s" style="color:${venc.length ? 'var(--bad)' : ''}">${venc.length} título(s) vencido(s): ${brl(venc.reduce((s, t) => s + t.valor, 0))}</div></div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card"><h3>Faturamento — últimos 6 meses</h3>${chart}</div>
    <div class="card"><h3>${isVend() ? 'Minha meta' : 'Metas dos vendedores'} (mês)</h3>${vendRank.map(({ v, t }) => { const pc = v.meta ? Math.min(100, t / v.meta * 100) : 0; return `<div style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><b>${esc(v.nome)}</b><span class="muted">${brl(t)} / ${brl(v.meta)}</span></div><div class="bar" style="margin-top:5px"><i style="width:${pc}%;background:${pc >= 100 ? 'var(--ok)' : 'var(--pri)'}"></i></div>${isVend() ? `<div class="hint" style="margin-top:6px">Comissão prevista: <b>${brl(t * v.comissao / 100)}</b></div>` : ''}</div>` }).join('')}</div>
  </div>
  <div class="grid half" style="margin-top:14px">
    <div class="card"><h3>Produtos mais vendidos (90 dias)</h3>${top.map(([id, v]) => { const p = byId('produtos', id); return `<div style="margin-bottom:10px"><div class="row" style="justify-content:space-between"><span>${esc(p ? p.nome : '?')}</span><b>${brl(v)}</b></div><div class="bar" style="margin-top:4px"><i style="width:${v / topMax * 100}%"></i></div></div>` }).join('') || '<p class="muted">Sem vendas.</p>'}</div>
    <div class="card"><h3>Clientes sem comprar há 30+ dias</h3>${semCompra.map(({ c, ult }) => `<div class="list-item"><a style="cursor:pointer" onclick="verCliente('${c.id}')">${esc(c.fantasia)}</a><span class="muted">${ult ? 'última: ' + fdate(ult) : 'nunca comprou'}</span></div>`).join('') || '<p class="muted">Todos os clientes compraram recentemente. ✅</p>'}</div>
  </div>
  ${isAdmin() ? `<div class="card" style="margin-top:14px"><h3>Estoque abaixo do mínimo <span class="badge b-bad">${baixo.length}</span></h3>${baixo.map(p => `<div class="list-item"><span>${esc(p.nome)}</span><span><b style="color:var(--bad)">${p.estoque}</b> <span class="muted">/ mín ${p.estoqueMin} ${p.unidade}</span></span></div>`).join('') || '<p class="muted">Tudo certo com o estoque. ✅</p>'}</div>` : ''}
  <div class="card" style="margin-top:14px"><h3>Pedidos recentes</h3>${tabelaPedidos([...db.pedidos].sort((a, b) => b.numero - a.numero).slice(0, 8))}</div>`;
};

function tabelaPedidos(rows) {
  const cols = [['Nº', p => `<b>#${p.numero}</b>`], ['Data', p => fdate(p.data)]];
  if (!isCli()) cols.push(['Cliente', p => esc((byId('clientes', p.clienteId) || {}).fantasia || '—')]);
  if (isAdmin()) cols.push(['Vendedor', p => esc((byId('vendedores', p.vendedorId) || {}).nome || '—')]);
  if (!isCli()) cols.push(['Origem', p => p.origem === 'Portal B2B' ? '<span class="badge">Portal B2B</span>' : `<span class="muted">${esc(p.origem || '')}</span>`]);
  cols.push(['Itens', p => p.itens.length, 'num'], ['Total', p => brl(totalPedido(p)), 'num'],
    ['Status', p => `<span class="badge ${STATUS_BADGE[p.status]}">${p.status}</span>${p.nfe && p.nfe.status === 'autorizada' ? ' <span class="badge b-ok">NF ' + p.nfe.numero + '</span>' : ''}`]);
  return tabela(cols, rows.map(p => ({ ...p, _click: `verPedido('${p.id}')` })));
}

VIEWS.pedidos = () => {
  setActions(`<button class="btn pri" onclick="${isCli() ? "go('catalogo')" : 'novoPedido()'}">+ Novo pedido</button>`);
  const s = state; let rows = [...db.pedidos].sort((a, b) => b.numero - a.numero);
  rows = rows.filter(p => { const c = byId('clientes', p.clienteId) || {}; return match(s.q, p.numero, c.razao, c.fantasia, c.cnpj) && (!s.st || p.status === s.st) && (!s.vd || p.vendedorId === s.vd) && (!s.di || p.data >= s.di) && (!s.df || p.data <= s.df); });
  const tot = rows.filter(p => p.status !== 'Cancelado').reduce((a, p) => a + totalPedido(p), 0);
  const cont = STATUS.map(st => `<button class="btn sm ${s.st === st ? 'pri' : ''}" onclick="state.st=state.st==='${st}'?'':'${st}';render()">${st} <span class="badge b-mut">${db.pedidos.filter(p => p.status === st).length}</span></button>`).join('');
  $('#view').innerHTML = `<div class="filters">${cont}</div>
  <div class="filters">${filtroTexto(isCli() ? 'Buscar nº do pedido...' : 'Buscar nº, cliente, CNPJ...')}${selVendedor()}
   <input type="date" value="${s.di || ''}" onchange="state.di=this.value;render()" title="De"><input type="date" value="${s.df || ''}" onchange="state.df=this.value;render()" title="Até">
   <span class="muted" style="align-self:center">${rows.length} pedido(s) · ${brl(tot)}</span></div>
  ${tabelaPedidos(rows)}`;
};

/* ---------- Editor de pedido ---------- */
function novoPedido(clienteId) {
  if (isCli()) clienteId = db.me.clienteId;
  const c = clienteId ? byId('clientes', clienteId) : null;
  draft = { id: null, data: today(), entrega: addDays(today(), 2), clienteId: clienteId || '', vendedorId: c ? c.vendedorId : (isVend() ? db.me.vendedorId : ''), condicaoId: c ? c.condicaoId : '', itens: [], frete: 0, descontoGeral: 0, obs: '' };
  editorPedido();
}
function editarPedido(id) {
  const p = byId('pedidos', id);
  if (!Regras.ABERTOS.includes(p.status)) return alert('Pedidos faturados, entregues ou cancelados não podem ser editados. Volte o status para "Aprovado" para editar (o estoque e os títulos em aberto serão estornados).');
  if (isCli() && p.status !== 'Orçamento') return alert('Este pedido já foi aprovado pela distribuidora. Fale com seu vendedor para alterá-lo.');
  draft = JSON.parse(JSON.stringify(p)); editorPedido();
}
function editorPedido() {
  const d = draft; const cli = byId('clientes', d.clienteId); const cliente = isCli();
  const sel = (col, lab, val, on, dis) => `<select onchange="${on}" ${dis ? 'disabled' : ''}><option value="">Selecione...</option>${(db[col] || []).filter(x => x.ativo !== 'Não' || x.id === val).map(x => `<option value="${x.id}" ${x.id === val ? 'selected' : ''}>${esc(x[lab])}</option>`).join('')}</select>`;
  const linhas = d.itens.map((i, k) => {
    const p = byId('produtos', i.produtoId) || {}; const sub = Regras.subtotalItem(i);
    return `<tr><td>${esc(p.codigo)}</td><td>${esc(p.nome)}${cliente ? '' : `<div class="muted" style="font-size:11px">Estoque: ${p.estoque} ${p.unidade}</div>`}</td>
    <td><input type="number" min="1" style="width:80px" value="${i.qtd}" onchange="draft.itens[${k}].qtd=Math.max(1,+this.value||1);editorPedido()"></td>
    <td>${cliente ? brl(i.preco) : `<input type="number" step="0.01" style="width:100px" value="${i.preco}" onchange="draft.itens[${k}].preco=+this.value||0;editorPedido()">`}</td>
    ${cliente ? '' : `<td><input type="number" step="0.1" style="width:70px" value="${i.desc || 0}" onchange="draft.itens[${k}].desc=+this.value||0;editorPedido()"></td>`}
    <td class="num">${brl(sub)}</td><td><button class="btn sm danger" onclick="draft.itens.splice(${k},1);editorPedido()">✕</button></td></tr>`;
  }).join('');
  const head = ['Cód', 'Produto', 'Qtd', 'Preço un.', ...(cliente ? [] : ['Desc %']), 'Subtotal', ''];
  const tbl = `<div class="tbl-wrap"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${linhas || `<tr><td colspan="${head.length}" class="muted" style="text-align:center;padding:24px">Nenhum item adicionado</td></tr>`}</tbody></table></div>`;
  openModal(`<h2>${d.id ? 'Editar pedido #' + d.numero : cliente ? 'Revisar e enviar pedido' : 'Novo pedido'}</h2>
  <div class="form">
    ${cliente ? `<div class="full"><b>${esc(cli.razao)}</b><div class="hint">Pagamento: ${esc((byId('condicoes', cli.condicaoId) || {}).nome)} · Vendedor: ${esc((byId('vendedores', cli.vendedorId) || {}).nome || '—')}</div></div>` : `
    <div class="full"><label>Cliente</label>${sel('clientes', 'razao', d.clienteId, 'setCliente(this.value)')}
      ${cli ? `<div class="muted" style="font-size:12px;margin-top:4px">${esc(cli.cnpj)} · ${esc(cli.cidade)}/${esc(cli.uf)} · Tabela: ${esc((byId('tabelas', cli.tabelaId) || {}).nome || '—')} · Limite: ${brl(cli.limite)} · Em aberto: <b>${brl(emAberto(cli.id))}</b></div>` : ''}</div>
    <div><label>Vendedor</label>${sel('vendedores', 'nome', d.vendedorId, 'draft.vendedorId=this.value', !isAdmin())}</div>
    <div><label>Condição de pagamento</label>${sel('condicoes', 'nome', d.condicaoId, 'draft.condicaoId=this.value')}</div>
    <div><label>Data</label><input type="date" value="${d.data}" onchange="draft.data=this.value"></div>`}
    <div><label>${cliente ? 'Entrega desejada' : 'Previsão de entrega'}</label><input type="date" value="${d.entrega || ''}" onchange="draft.entrega=this.value"></div>
  </div>
  <h3 style="margin-top:18px">Itens</h3>
  <div class="row" style="margin-bottom:10px"><input list="dlprod" id="addProd" placeholder="Código, EAN ou nome do produto + Enter" onkeydown="if(event.key==='Enter'){addItemBusca(this.value)}">
    <datalist id="dlprod">${db.produtos.filter(p => p.ativo !== 'Não').map(p => `<option value="${esc(p.codigo)} - ${esc(p.nome)}">`).join('')}</datalist>
    <button class="btn" onclick="addItemBusca($('#addProd').value)">Adicionar</button></div>
  ${tbl}
  <div class="grid edit-grid" style="margin-top:14px;align-items:start">
    <div><label>Observações</label><textarea rows="4" onchange="draft.obs=this.value">${esc(d.obs)}</textarea></div>
    <div class="totals">
      <div><span>Itens</span><span>${brl(totalItens(d))}</span></div>
      ${cliente ? '' : `<div><span>Desconto geral (%)</span><input type="number" step="0.1" style="width:90px;padding:4px 6px" value="${d.descontoGeral || 0}" onchange="draft.descontoGeral=+this.value||0;editorPedido()"></div>
      <div><span>Frete (R$)</span><input type="number" step="0.01" style="width:90px;padding:4px 6px" value="${d.frete || 0}" onchange="draft.frete=+this.value||0;editorPedido()"></div>`}
      <div class="g"><span>Total</span><span>${brl(totalPedido(d))}</span></div>
    </div>
  </div>
  <div class="actions"><button class="btn" onclick="closeModal()">Cancelar</button>
   ${cliente ? `<button class="btn pri" onclick="salvarPedido(false)">Enviar pedido</button>` : `<button class="btn" onclick="salvarPedido(false)">Salvar como orçamento</button><button class="btn pri" onclick="salvarPedido(true)">Salvar e aprovar</button>`}</div>`, true);
}
function setCliente(id) {
  draft.clienteId = id; const c = byId('clientes', id);
  if (c) { if (isAdmin()) draft.vendedorId = c.vendedorId; draft.condicaoId = c.condicaoId; draft.itens.forEach(i => { const p = byId('produtos', i.produtoId); if (p) i.preco = precoCliente(p, c); }); }
  editorPedido();
}
function addItemBusca(txt) {
  txt = (txt || '').trim(); if (!txt) return;
  const cod = txt.split(' - ')[0]; const ativos = db.produtos.filter(x => x.ativo !== 'Não');
  const p = ativos.find(x => x.codigo === cod || x.ean === cod) || ativos.find(x => x.nome.toLowerCase().includes(txt.toLowerCase()));
  if (!p) { toast('Produto não encontrado'); return; }
  const ex = draft.itens.find(i => i.produtoId === p.id);
  if (ex) ex.qtd++; else draft.itens.push({ produtoId: p.id, qtd: 1, preco: precoCliente(p, byId('clientes', draft.clienteId)), desc: 0 });
  editorPedido(); setTimeout(() => $('#addProd') && $('#addProd').focus(), 0);
}
async function salvarPedido(aprovar) {
  const d = draft;
  if (!d.clienteId) return toast('Selecione o cliente'); if (!d.itens.length) return toast('Adicione pelo menos um item');
  const r = await acao(() => api('POST', '/api/pedidos', { pedido: d, aprovar }));
  if (!r) return;
  closeModal(); if (page === 'catalogo') state.cart = [];
  render(); verPedido(r.id);
  toast(isCli() ? 'Pedido enviado! A distribuidora vai confirmar em breve.' : 'Pedido salvo');
}
function verPedido(id) {
  const p = byId('pedidos', id); if (!p) return;
  const c = byId('clientes', p.clienteId) || {}; const v = byId('vendedores', p.vendedorId) || {}; const cond = byId('condicoes', p.condicaoId) || {};
  const tits = db.titulos.filter(t => t.pedidoId === id); const e = db.empresa;
  const idx = STATUS.indexOf(p.status);
  let prox = [], alvos = [];
  if (isAdmin()) { prox = p.status === 'Cancelado' ? [] : STATUS.slice(0, 5).filter((s, i) => i === idx + 1); alvos = STATUS.filter(s => s !== p.status); }
  else if (isVend()) { if (p.status === 'Orçamento') prox = ['Aprovado']; if (['Orçamento', 'Aprovado'].includes(p.status)) alvos = ['Orçamento', 'Aprovado', 'Cancelado'].filter(s => s !== p.status); }
  else if (p.status === 'Orçamento') alvos = ['Cancelado'];
  const editavel = isCli() ? p.status === 'Orçamento' : Regras.ABERTOS.includes(p.status);
  const nfe = p.nfe;
  openModal(`<div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:wrap">
    <div><h2 style="margin-bottom:4px">Pedido #${p.numero} <span class="badge ${STATUS_BADGE[p.status]}">${p.status}</span></h2><div class="muted">${esc(e.nome)} · CNPJ ${esc(e.cnpj)} · ${esc(e.telefone)}</div></div>
    <div class="no-print row" style="flex-wrap:wrap">${prox.map(s => `<button class="btn pri sm" onclick="statusPedido('${id}','${s}')">→ ${s}</button>`).join('')}
     ${alvos.length ? `<select style="width:auto;padding:4px 8px;font-size:12px" onchange="if(this.value)statusPedido('${id}',this.value)"><option value="">${isCli() ? 'Ações...' : 'Alterar status...'}</option>${alvos.map(s => `<option value="${s}">${isCli() && s === 'Cancelado' ? 'Cancelar pedido' : s}</option>`).join('')}</select>` : ''}</div>
  </div>
  <div class="grid half" style="margin:14px 0">
    <div class="card" style="padding:12px"><div class="muted" style="font-size:12px">CLIENTE</div><b>${esc(c.razao)}</b><br>${esc(c.cnpj)}<br>${esc(c.logradouro || '')}${c.numero ? ', ' + esc(c.numero) : ''} ${esc(c.bairro || '')}<br>${esc(c.cidade)}/${esc(c.uf)} · ${esc(c.telefone)}</div>
    <div class="card" style="padding:12px"><div class="muted" style="font-size:12px">DADOS</div>Emissão: ${fdate(p.data)} · Entrega: ${fdate(p.entrega)}<br>Vendedor: ${esc(v.nome || '—')}<br>Pagamento: ${esc(cond.nome)}${p.faturamento ? '<br>Faturado em: ' + fdate(p.faturamento) : ''}<br><span class="muted">Origem: ${esc(p.origem || '—')}${p.criadoPor ? ' · por ' + esc(p.criadoPor) : ''}</span></div>
  </div>
  ${tabela([['Cód', i => esc((byId('produtos', i.produtoId) || {}).codigo)], ['Produto', i => esc((byId('produtos', i.produtoId) || {}).nome)], ['Qtd', i => num(i.qtd) + ' ' + ((byId('produtos', i.produtoId) || {}).unidade || ''), 'num'], ['Preço', i => brl(i.preco), 'num'], ['Desc', i => (i.desc || 0) + '%', 'num'], ['Subtotal', i => brl(Regras.subtotalItem(i)), 'num']], p.itens)}
  <div class="grid edit-grid" style="margin-top:12px;align-items:start">
    <div>${p.obs ? `<label>Observações</label><div>${esc(p.obs)}</div>` : ''}
     ${tits.length ? `<label style="margin-top:10px">Parcelas</label>${tits.map(t => `<div>${t.parcela} — venc. ${fdate(t.vencimento)} — ${brl(t.valor)} ${t.pago ? '<span class="badge b-ok">pago</span>' : t.vencimento < today() ? '<span class="badge b-bad">vencido</span>' : ''}</div>`).join('')}` : ''}
     ${nfe ? `<div class="nfe"><b>NF-e ${nfe.numero ? 'nº ' + nfe.numero + ' série ' + nfe.serie : ''}</b> — ${esc(nfe.status)}${nfe.simulada ? ' <span class="badge b-warn">simulação</span>' : ''}<br><span class="hint" style="word-break:break-all">${nfe.chave ? 'Chave: ' + esc(nfe.chave) : ''} ${esc(nfe.mensagem || '')}</span>${nfe.danfe ? `<br><a href="${esc(nfe.danfe)}" target="_blank" rel="noopener">Abrir DANFE</a>` : ''}
       ${isAdmin() && nfe.status === 'processando' ? `<br><button class="btn sm" onclick="emitirNfe('${id}')">Consultar situação</button>` : ''}</div>`
      : isAdmin() && BAIXA.includes(p.status) ? `<div class="no-print" style="margin-top:12px"><button class="btn" onclick="emitirNfe('${id}')">🧾 Emitir NF-e${db.nfeProvedor === 'simulado' ? ' (simulação)' : ''}</button></div>` : ''}
     ${(p.historico || []).length ? `<label style="margin-top:10px">Histórico</label>${p.historico.map(h => `<div class="hint">${new Date(h.em).toLocaleString('pt-BR')} — ${esc(h.por)} → ${esc(h.status)}</div>`).join('')}` : ''}</div>
    <div class="totals"><div><span>Itens</span><span>${brl(totalItens(p))}</span></div>${p.descontoGeral ? `<div><span>Desconto</span><span>-${p.descontoGeral}%</span></div>` : ''}${p.frete ? `<div><span>Frete</span><span>${brl(p.frete)}</span></div>` : ''}<div class="g"><span>Total</span><span>${brl(totalPedido(p))}</span></div></div>
  </div>
  <div class="actions">${isAdmin() ? `<button class="btn danger" onclick="excluirPedido('${id}')">Excluir</button>` : ''}<span style="flex:1"></span>
   <button class="btn" onclick="duplicarPedido('${id}')">${isCli() ? 'Repetir pedido' : 'Duplicar'}</button>${isCli() ? '' : `<button class="btn" onclick="whatsPedido('${id}')">WhatsApp</button>`}<button class="btn" onclick="window.print()">Imprimir</button>
   ${editavel ? `<button class="btn" onclick="editarPedido('${id}')">Editar</button>` : ''}<button class="btn pri" onclick="closeModal()">Fechar</button></div>`, true);
}
async function statusPedido(id, s, forcar) {
  if (s === 'Cancelado' && !forcar && !confirm('Cancelar o pedido?' + (isAdmin() ? ' Estoque e títulos em aberto serão estornados.' : ''))) return;
  try { await api('POST', `/api/pedidos/${id}/status`, { status: s, forcar }); toast('Status: ' + s); render(); verPedido(id); }
  catch (e) {
    if (e.status === 409 && confirm(e.message + '\n\nFaturar mesmo assim?')) return statusPedido(id, s, true);
    if (e.status !== 409 && e.status !== 401) alert(e.message);
    verPedido(id);
  }
}
async function excluirPedido(id) {
  const p = byId('pedidos', id); if (!confirm('Excluir pedido #' + p.numero + '? Esta ação não pode ser desfeita.')) return;
  if (await acao(() => api('DELETE', '/api/pedidos/' + id), 'Pedido excluído')) closeModal();
}
async function emitirNfe(id) {
  toast('Comunicando com o emissor de NF-e...');
  try { const r = await api('POST', `/api/pedidos/${id}/nfe`); toast('NF-e: ' + r.nfe.status); }
  catch (e) { if (e.status !== 401) alert('Não foi possível emitir a NF-e:\n\n' + e.message); }
  render(); verPedido(id);
}
function duplicarPedido(id) {
  const p = byId('pedidos', id); const c = byId('clientes', p.clienteId);
  draft = { clienteId: p.clienteId, vendedorId: p.vendedorId, condicaoId: p.condicaoId, frete: isCli() ? 0 : p.frete, descontoGeral: isCli() ? 0 : p.descontoGeral, obs: p.obs, id: null, data: today(), entrega: addDays(today(), 2),
    itens: p.itens.filter(i => { const pr = byId('produtos', i.produtoId); return pr && pr.ativo !== 'Não'; }).map(i => ({ ...i, preco: precoCliente(byId('produtos', i.produtoId), c) })) };
  editorPedido();
}
function whatsPedido(id) {
  const p = byId('pedidos', id); const c = byId('clientes', p.clienteId) || {};
  const txt = `*Pedido #${p.numero}* - ${db.empresa.nome}\nCliente: ${c.razao}\n\n` + p.itens.map(i => { const pr = byId('produtos', i.produtoId) || {}; return `${i.qtd}x ${pr.nome} - ${brl(Regras.subtotalItem(i))}` }).join('\n') + `\n\n*Total: ${brl(totalPedido(p))}*`;
  window.open('https://wa.me/' + (c.telefone || '').replace(/\D/g, '').replace(/^(?!55)/, '55') + '?text=' + encodeURIComponent(txt), '_blank');
}

/* ---------- Catálogo (força de vendas / portal B2B) ---------- */
VIEWS.catalogo = () => {
  state.cart = state.cart || []; const s = state;
  if (isCli()) s.cli = db.me.clienteId;
  const cli = byId('clientes', s.cli);
  const ativos = db.produtos.filter(p => p.ativo !== 'Não');
  const cats = [...new Set(ativos.map(p => p.categoria))];
  const prods = ativos.filter(p => match(s.q, p.nome, p.codigo, p.marca, p.ean) && (!s.cat || p.categoria === s.cat));
  const cartTot = s.cart.reduce((a, i) => a + i.qtd * precoCliente(byId('produtos', i.produtoId), cli), 0);
  const disp = p => isCli() ? (p.estoque > 0 ? '<span style="color:var(--ok)">Disponível</span>' : '<span style="color:var(--bad)">Sob consulta</span>')
    : `<span style="color:${p.estoque <= p.estoqueMin ? 'var(--bad)' : 'inherit'}">${p.estoque} ${p.unidade} em estoque</span>`;
  $('#view').innerHTML = `
  ${isCli() ? `<div class="card" style="margin-bottom:14px">Olá, <b>${esc(db.me.nome)}</b>! Monte seu pedido abaixo — os preços já estão com as condições da sua empresa.
    ${db.pedidos.length ? `<button class="btn sm" style="margin-left:8px" onclick="duplicarPedido('${[...db.pedidos].sort((a, b) => b.numero - a.numero)[0].id}')">↻ Repetir último pedido</button>` : ''}</div>` : ''}
  <div class="grid two" style="align-items:start">
   <div>
    <div class="filters">${filtroTexto('Buscar produto, código, EAN...')}
      <select onchange="state.cat=this.value;render()"><option value="">Todas categorias</option>${cats.map(c => `<option ${s.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="grid cat">${prods.map(p => {
      const inCart = s.cart.find(i => i.produtoId === p.id); return `<div class="card prod">
      <div class="img">${esc(p.nome.split(' ').slice(0, 2).map(w => w[0]).join(''))}</div>
      <div style="font-weight:600;min-height:40px">${esc(p.nome)}</div>
      <div class="muted" style="font-size:12px">${esc(p.codigo)} · ${esc(p.categoria)} · ${disp(p)}</div>
      <div class="pr">${brl(precoCliente(p, cli))}<span class="muted" style="font-size:12px;font-weight:400"> /${p.unidade}</span></div>
      ${inCart ? `<div class="row"><button class="btn sm" onclick="cartAdd('${p.id}',-1)">−</button><input type="number" style="text-align:center;padding:4px" value="${inCart.qtd}" onchange="cartSet('${p.id}',+this.value)"><button class="btn sm" onclick="cartAdd('${p.id}',1)">+</button></div>`
          : `<button class="btn pri" onclick="cartAdd('${p.id}',1)">Adicionar</button>`}
    </div>`}).join('') || '<p class="muted">Nenhum produto encontrado.</p>'}</div>
   </div>
   <div class="card cart"><h3>🛒 Carrinho</h3>
    ${isCli() ? '' : `<label>Cliente</label><select onchange="state.cli=this.value;render()"><option value="">Selecione o cliente...</option>${db.clientes.filter(c => c.ativo !== 'Não').map(c => `<option value="${c.id}" ${s.cli === c.id ? 'selected' : ''}>${esc(c.fantasia)} — ${esc(c.cidade)}</option>`).join('')}</select>`}
    ${cli ? `<div class="muted" style="font-size:12px;margin:6px 0">${isCli() ? '' : 'Tabela ' + esc((byId('tabelas', cli.tabelaId) || {}).nome) + ' · '}Pagamento ${esc((byId('condicoes', cli.condicaoId) || {}).nome)}</div>` : ''}
    <div style="margin-top:10px">${s.cart.map(i => { const p = byId('produtos', i.produtoId); return `<div class="list-item"><span>${i.qtd}× ${esc(p.nome)}</span><b>${brl(i.qtd * precoCliente(p, cli))}</b></div>` }).join('') || '<p class="muted">Carrinho vazio.</p>'}</div>
    <div class="totals" style="max-width:none"><div class="g"><span>Total</span><span>${brl(cartTot)}</span></div></div>
    <div class="actions"><button class="btn" onclick="state.cart=[];render()">Limpar</button><button class="btn pri" onclick="cartFinalizar()" ${s.cart.length ? '' : 'disabled'}>Revisar pedido →</button></div>
   </div></div>`;
};
function cartAdd(pid, n) { const c = state.cart; const i = c.find(x => x.produtoId === pid); if (i) { i.qtd += n; if (i.qtd <= 0) c.splice(c.indexOf(i), 1); } else if (n > 0) c.push({ produtoId: pid, qtd: n }); rerender(); }
function cartSet(pid, q) { const i = state.cart.find(x => x.produtoId === pid); if (!i) return; if (q <= 0) state.cart.splice(state.cart.indexOf(i), 1); else i.qtd = q; render(); }
function cartFinalizar() {
  if (!state.cli) return toast('Selecione o cliente');
  novoPedido(state.cli); const c = byId('clientes', state.cli);
  draft.itens = state.cart.map(i => ({ produtoId: i.produtoId, qtd: i.qtd, preco: precoCliente(byId('produtos', i.produtoId), c), desc: 0 })); editorPedido();
}

/* ---------- Cadastros ---------- */
VIEWS.produtos = () => {
  if (isAdmin()) setActions(`<button class="btn" onclick="exportCSV('produtos')">Exportar CSV</button><button class="btn pri" onclick="editar('produtos')">+ Novo produto</button>`);
  const s = state; const cats = [...new Set(db.produtos.map(p => p.categoria))];
  const rows = db.produtos.filter(p => match(s.q, p.nome, p.codigo, p.marca, p.ean) && (!s.cat || p.categoria === s.cat) && (!s.baixo || p.estoque <= p.estoqueMin)).map(p => ({ ...p, _click: `editar('produtos','${p.id}')` }));
  const cols = [['Código', p => esc(p.codigo)], ['Descrição', p => `<b>${esc(p.nome)}</b>${p.ativo === 'Não' ? ' <span class="badge b-mut">inativo</span>' : ''}`], ['Categoria', p => esc(p.categoria)], ['Un', p => p.unidade]];
  if (isAdmin()) cols.push(['Custo', p => brl(p.custo), 'num']);
  cols.push(['Preço base', p => brl(p.preco), 'num']);
  if (isAdmin()) cols.push(['Margem', p => p.preco ? num((1 - p.custo / p.preco) * 100, 1) + '%' : '—', 'num']);
  cols.push(['Estoque', p => `<span class="badge ${p.estoque <= p.estoqueMin ? 'b-bad' : 'b-ok'}">${num(p.estoque)}</span>`, 'num']);
  $('#view').innerHTML = `<div class="filters">${filtroTexto('Buscar por nome, código, EAN...')}
   <select onchange="state.cat=this.value;render()"><option value="">Todas categorias</option>${cats.map(c => `<option ${s.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
   <button class="btn ${s.baixo ? 'pri' : ''}" onclick="state.baixo=!state.baixo;render()">Só estoque baixo</button></div>${tabela(cols, rows)}`;
};
VIEWS.clientes = () => {
  setActions(`${isAdmin() ? `<button class="btn" onclick="exportCSV('clientes')">Exportar CSV</button>` : ''}<button class="btn pri" onclick="editar('clientes')">+ Novo cliente</button>`);
  const s = state; const lim90 = addDays(today(), -90);
  const rows = db.clientes.filter(c => match(s.q, c.razao, c.fantasia, c.cnpj, c.cidade) && (!s.vd || c.vendedorId === s.vd)).map(c => {
    const ps = db.pedidos.filter(p => p.clienteId === c.id && vendaValida(p)); const ult = ps.map(p => p.data).sort().pop();
    return { ...c, ult, compras: ps.filter(p => p.data >= lim90).reduce((a, p) => a + totalPedido(p), 0), aberto: emAberto(c.id), venc: db.titulos.some(t => t.clienteId === c.id && !t.pago && t.vencimento < today()), _click: `verCliente('${c.id}')` };
  });
  const cols = [['Cliente', c => `<b>${esc(c.fantasia)}</b><div class="muted" style="font-size:12px">${esc(c.razao)}</div>`], ['CNPJ', c => esc(c.cnpj)], ['Cidade', c => esc(c.cidade) + '/' + esc(c.uf)]];
  if (isAdmin()) cols.push(['Vendedor', c => esc((byId('vendedores', c.vendedorId) || {}).nome || '—')]);
  cols.push(['Última compra', c => c.ult ? fdate(c.ult) : '<span class="muted">nunca</span>'], ['Compras 90d', c => brl(c.compras), 'num'],
    ['Em aberto', c => `${brl(c.aberto)} ${c.venc ? '<span class="badge b-bad">vencido</span>' : ''}`, 'num'], ['Status', c => c.ativo === 'Não' ? '<span class="badge b-mut">Inativo</span>' : '<span class="badge b-ok">Ativo</span>']);
  $('#view').innerHTML = `<div class="filters">${filtroTexto('Buscar razão, fantasia, CNPJ, cidade...')}${selVendedor()}</div>${tabela(cols, rows)}`;
};
function verCliente(id) {
  const c = byId('clientes', id); const ps = db.pedidos.filter(p => p.clienteId === id).sort((a, b) => b.numero - a.numero);
  const ts = db.titulos.filter(t => t.clienteId === id && !t.pago);
  openModal(`<h2>${esc(c.fantasia)} <span class="muted" style="font-weight:400;font-size:14px">${esc(c.razao)}</span></h2>
   <div class="grid kpis" style="margin-bottom:14px">
    <div class="card kpi"><div class="l">Total comprado</div><div class="v" style="font-size:18px">${brl(ps.filter(vendaValida).reduce((a, p) => a + totalPedido(p), 0))}</div></div>
    <div class="card kpi"><div class="l">Em aberto</div><div class="v" style="font-size:18px">${brl(emAberto(id))}</div><div class="s">Limite ${brl(c.limite)}</div></div>
    <div class="card kpi"><div class="l">Pedidos</div><div class="v" style="font-size:18px">${ps.length}</div></div></div>
   <div class="muted" style="margin-bottom:10px">${esc(c.cnpj)} · ${esc(c.telefone)} · ${esc(c.email)} · ${esc(c.cidade)}/${esc(c.uf)}</div>
   ${ts.length ? `<h3>Títulos em aberto</h3>${tabela([['Pedido', t => '#' + ((byId('pedidos', t.pedidoId) || {}).numero || '')], ['Parcela', t => t.parcela], ['Vencimento', t => fdate(t.vencimento) + (t.vencimento < today() ? ' <span class="badge b-bad">vencido</span>' : '')], ['Valor', t => brl(t.valor), 'num']], ts)}<br>` : ''}
   <h3>Histórico de pedidos</h3>${tabelaPedidos(ps.slice(0, 15))}
   <div class="actions"><button class="btn" onclick="editar('clientes','${id}')">Editar cadastro</button><button class="btn pri" onclick="novoPedido('${id}')">+ Novo pedido</button></div>`, true);
}
VIEWS.vendedores = () => {
  setActions(`<button class="btn pri" onclick="editar('vendedores')">+ Novo vendedor</button>`);
  const mes = today().slice(0, 7);
  const rows = db.vendedores.map(v => {
    const ps = db.pedidos.filter(p => p.vendedorId === v.id && vendaValida(p) && (p.faturamento || p.data).startsWith(mes)); const t = ps.reduce((a, p) => a + totalPedido(p), 0);
    return { ...v, t, n: ps.length, cli: db.clientes.filter(c => c.vendedorId === v.id).length, acesso: db.usuarios.some(u => u.vendedorId === v.id && u.ativo !== 'Não'), _click: `editar('vendedores','${v.id}')` };
  });
  $('#view').innerHTML = tabela([['Vendedor', v => `<b>${esc(v.nome)}</b><div class="muted" style="font-size:12px">${esc(v.email)}</div>`], ['Acesso', v => v.acesso ? '<span class="badge b-ok">com login</span>' : '<span class="badge b-mut">sem login</span>'], ['Carteira', v => v.cli + ' clientes', 'num'],
    ['Vendas no mês', v => brl(v.t), 'num'], ['Pedidos', v => v.n, 'num'], ['Meta', v => brl(v.meta), 'num'], ['Atingido', v => { const pc = v.meta ? v.t / v.meta * 100 : 0; return `<div class="row"><div class="bar" style="width:90px"><i style="width:${Math.min(100, pc)}%"></i></div>${num(pc)}%</div>` }],
    ['Comissão', v => `${num(v.comissao, 1)}% = <b>${brl(v.t * v.comissao / 100)}</b>`, 'num']], rows) + `<p class="hint">Para o vendedor acessar o sistema pelo celular, crie um login em <a style="cursor:pointer" onclick="go('usuarios')">Usuários e acessos</a>.</p>`;
};

/* ---------- Estoque ---------- */
VIEWS.estoque = () => {
  setActions(`<button class="btn pri" onclick="lancMov()">+ Lançar movimentação</button>`);
  const s = state; const rows = db.movimentos.filter(m => { const p = byId('produtos', m.produtoId) || {}; return match(s.q, p.nome, p.codigo, m.ref) && (!s.tp || m.tipo === s.tp); }).slice(0, 300);
  const valor = db.produtos.reduce((a, p) => a + p.estoque * p.custo, 0);
  $('#view').innerHTML = `<div class="grid kpis" style="margin-bottom:14px">
   <div class="card kpi"><div class="l">Valor em estoque (custo)</div><div class="v">${brl(valor)}</div></div>
   <div class="card kpi"><div class="l">Itens cadastrados</div><div class="v">${db.produtos.length}</div></div>
   <div class="card kpi"><div class="l">Abaixo do mínimo</div><div class="v" style="color:var(--bad)">${db.produtos.filter(p => p.estoque <= p.estoqueMin).length}</div></div></div>
  <div class="filters">${filtroTexto('Buscar produto ou referência...')}<select onchange="state.tp=this.value;render()"><option value="">Todos os tipos</option>${['Entrada', 'Saída', 'Estorno', 'Ajuste'].map(t => `<option ${s.tp === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
  ${tabela([['Data', m => fdate(m.data)], ['Produto', m => esc((byId('produtos', m.produtoId) || {}).nome)], ['Tipo', m => `<span class="badge ${m.tipo === 'Saída' ? 'b-warn' : m.tipo === 'Ajuste' ? 'b-mut' : 'b-ok'}">${m.tipo}</span>`], ['Qtd', m => (m.tipo === 'Saída' ? '-' : m.tipo === 'Ajuste' ? '=' : '+') + num(m.qtd), 'num'], ['Saldo', m => num(m.saldo), 'num'], ['Referência', m => esc(m.ref)]], rows, 'Nenhuma movimentação')}`;
};
function lancMov() {
  openModal(`<h2>Lançar movimentação de estoque</h2><div class="form">
   <div class="full"><label>Produto</label><select id="mvP">${db.produtos.map(p => `<option value="${p.id}">${esc(p.codigo)} - ${esc(p.nome)} (atual: ${p.estoque})</option>`).join('')}</select></div>
   <div><label>Tipo</label><select id="mvT"><option>Entrada</option><option>Saída</option><option value="Ajuste">Ajuste (inventário)</option></select></div>
   <div><label>Quantidade</label><input id="mvQ" type="number" min="0" value="1"></div>
   <div class="full"><label>Referência (NF de compra, motivo...)</label><input id="mvR" placeholder="NF 12345 - Fornecedor X"></div></div>
   <div class="actions"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn pri" onclick="registrarMov()">Registrar</button></div>`);
}
async function registrarMov() {
  const b = { produtoId: $('#mvP').value, tipo: $('#mvT').value, qtd: +$('#mvQ').value, ref: $('#mvR').value };
  if (await acao(() => api('POST', '/api/estoque', b), 'Movimentação registrada')) closeModal();
}

/* ---------- Financeiro ---------- */
VIEWS.financeiro = () => {
  const s = state; s.sit = s.sit ?? 'aberto'; const hoje = today();
  const rows = db.titulos.filter(t => {
    const c = byId('clientes', t.clienteId) || {}; const sit = t.pago ? 'pago' : t.vencimento < hoje ? 'vencido' : 'aberto';
    return match(s.q, c.razao, c.fantasia) && (s.sit === 'todos' || (s.sit === 'aberto' ? !t.pago : sit === s.sit));
  }).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const ab = db.titulos.filter(t => !t.pago), vc = ab.filter(t => t.vencimento < hoje), sem = ab.filter(t => t.vencimento >= hoje && t.vencimento <= addDays(hoje, 7));
  const recMes = db.titulos.filter(t => t.pago && (t.dataPagamento || '').startsWith(hoje.slice(0, 7)));
  const sum = a => a.reduce((x, t) => x + t.valor, 0);
  const cols = [['Vencimento', t => fdate(t.vencimento)]];
  if (!isCli()) cols.push(['Cliente', t => esc((byId('clientes', t.clienteId) || {}).fantasia)]);
  cols.push(['Pedido', t => `<a onclick="verPedido('${t.pedidoId}')" style="cursor:pointer">#${(byId('pedidos', t.pedidoId) || {}).numero || ''}</a>`], ['Parcela', t => t.parcela], ['Valor', t => brl(t.valor), 'num'],
    ['Situação', t => t.pago ? `<span class="badge b-ok">Pago ${fdate(t.dataPagamento)}</span>` : t.vencimento < hoje ? `<span class="badge b-bad">Vencido há ${Math.round((new Date(hoje) - new Date(t.vencimento)) / 864e5)}d</span>` : '<span class="badge">Em aberto</span>']);
  if (isAdmin()) cols.push(['', t => t.pago ? `<button class="btn sm" onclick="baixar('${t.id}',false)">Estornar</button>` : `<button class="btn sm ok" onclick="baixar('${t.id}',true)">Receber</button>`]);
  $('#view').innerHTML = `<div class="grid kpis" style="margin-bottom:14px">
   <div class="card kpi"><div class="l">${isCli() ? 'Total em aberto' : 'Total a receber'}</div><div class="v">${brl(sum(ab))}</div><div class="s">${ab.length} títulos</div></div>
   <div class="card kpi"><div class="l">Vencidos</div><div class="v" style="color:var(--bad)">${brl(sum(vc))}</div><div class="s">${vc.length} títulos</div></div>
   <div class="card kpi"><div class="l">Vencem em 7 dias</div><div class="v" style="color:var(--warn)">${brl(sum(sem))}</div><div class="s">${sem.length} títulos</div></div>
   ${isCli() ? '' : `<div class="card kpi"><div class="l">Recebido no mês</div><div class="v" style="color:var(--ok)">${brl(sum(recMes))}</div></div>`}</div>
  <div class="filters">${isCli() ? '' : filtroTexto('Buscar cliente...')}${[['aberto', 'Em aberto'], ['vencido', 'Vencidos'], ['pago', 'Pagos'], ['todos', 'Todos']].map(([k, l]) => `<button class="btn ${s.sit === k ? 'pri' : ''}" onclick="state.sit='${k}';render()">${l}</button>`).join('')}</div>
  ${tabela(cols, rows, 'Nenhum título')}`;
};
async function baixar(id, pago) { await acao(() => api('POST', '/api/titulos/' + id, { pago }), pago ? 'Título baixado' : 'Baixa estornada'); }

/* ---------- Relatórios ---------- */
VIEWS.relatorios = () => {
  const s = state; s.di = s.di || today().slice(0, 7) + '-01'; s.df = s.df || today(); s.ag = s.ag || (isVend() ? 'cliente' : 'vendedor');
  const ps = db.pedidos.filter(p => vendaValida(p) && (p.faturamento || p.data) >= s.di && (p.faturamento || p.data) <= s.df);
  const g = {};
  ps.forEach(p => {
    const fator = totalItens(p) ? (totalPedido(p) - (p.frete || 0)) / totalItens(p) : 1;
    p.itens.forEach(i => {
      const pr = byId('produtos', i.produtoId) || {}; const v = Regras.subtotalItem(i) * fator; const custo = i.qtd * (pr.custo || 0);
      let k, n; if (s.ag === 'vendedor') { k = p.vendedorId; n = (byId('vendedores', k) || {}).nome; } else if (s.ag === 'cliente') { k = p.clienteId; n = (byId('clientes', k) || {}).fantasia; }
      else if (s.ag === 'produto') { k = i.produtoId; n = pr.nome; } else { k = pr.categoria; n = pr.categoria; }
      g[k] = g[k] || { k, nome: n, v: 0, q: 0, n: new Set(), custo: 0 }; g[k].v += v; g[k].q += i.qtd; g[k].custo += custo; g[k].n.add(p.id);
    });
  });
  const rows = Object.values(g).sort((a, b) => b.v - a.v); const tot = rows.reduce((a, r) => a + r.v, 0);
  let ac = 0; rows.forEach((r, i) => { r.i = i + 1; r.ac = ac; ac += tot ? r.v / tot * 100 : 0; });
  const cols = [['#', r => r.i], ['Nome', r => `<b>${esc(r.nome)}</b>`], ['Pedidos', r => r.n.size, 'num'], ['Qtd itens', r => num(r.q), 'num'], ['Vendas', r => brl(r.v), 'num'], ['% do total', r => num(tot ? r.v / tot * 100 : 0, 1) + '%', 'num']];
  if (isAdmin()) cols.push(['Margem', r => brl(r.v - r.custo) + ' <span class="muted">(' + num(r.v ? (1 - r.custo / r.v) * 100 : 0, 1) + '%)</span>', 'num']);
  if (s.ag === 'vendedor') cols.push(['Comissão', r => { const v = byId('vendedores', r.k); return v ? brl(r.v * v.comissao / 100) : '—' }, 'num']);
  else cols.push(['Curva', r => { const c = r.ac < 80 ? 'A' : r.ac < 95 ? 'B' : 'C'; return `<span class="badge ${c === 'A' ? 'b-ok' : c === 'B' ? 'b-warn' : 'b-mut'}">${c}</span>` }]);
  const tipos = [['vendedor', 'Vendas por vendedor (comissões)'], ['cliente', 'Vendas por cliente (curva ABC)'], ['produto', 'Vendas por produto'], ['categoria', 'Vendas por categoria']];
  setActions(`<button class="btn" onclick="window.print()">Imprimir</button>`);
  $('#view').innerHTML = `<div class="filters"><select onchange="state.ag=this.value;render()">${tipos.map(([k, l]) => `<option value="${k}" ${s.ag === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <input type="date" value="${s.di}" onchange="state.di=this.value;render()"><input type="date" value="${s.df}" onchange="state.df=this.value;render()">
    <span class="muted" style="align-self:center">${ps.length} pedidos faturados · ${brl(tot)}</span></div>
   ${tabela(cols, rows, 'Nenhuma venda no período')}`;
};

/* ---------- Tabelas / condições ---------- */
VIEWS.tabelas = () => {
  $('#view').innerHTML = `<div class="grid half">
   <div><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">Tabelas de preço</h3><button class="btn sm pri" onclick="editar('tabelas')">+ Nova</button></div>
    ${tabela([['Nome', t => `<b>${esc(t.nome)}</b>`], ['Ajuste', t => (t.ajuste > 0 ? '+' : '') + num(t.ajuste, 1) + '%', 'num'], ['Clientes', t => db.clientes.filter(c => c.tabelaId === t.id).length, 'num']], db.tabelas.map(t => ({ ...t, _click: `editar('tabelas','${t.id}')` })))}
    <p class="hint">Preço do cliente = preço base do produto × (1 + ajuste da tabela).</p></div>
   <div><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">Condições de pagamento</h3><button class="btn sm pri" onclick="editar('condicoes')">+ Nova</button></div>
    ${tabela([['Nome', c => `<b>${esc(c.nome)}</b>`], ['Parcelas (dias)', c => esc(c.parcelas)]], db.condicoes.map(c => ({ ...c, _click: `editar('condicoes','${c.id}')` })))}
    <p class="hint">Ao faturar, os títulos a receber são gerados conforme as parcelas.</p></div></div>`;
};

/* ---------- Usuários ---------- */
VIEWS.usuarios = () => {
  setActions(`<button class="btn pri" onclick="editar('usuarios')">+ Novo usuário</button>`);
  const nomes = { admin: 'Administrador', vendedor: 'Vendedor', cliente: 'Cliente (portal)' };
  $('#view').innerHTML = tabela([['Nome', u => `<b>${esc(u.nome)}</b>`], ['E-mail (login)', u => esc(u.email)], ['Perfil', u => `<span class="badge ${u.papel === 'admin' ? 'b-warn' : u.papel === 'cliente' ? '' : 'b-ok'}">${nomes[u.papel]}</span>`],
    ['Vinculado a', u => esc(u.papel === 'vendedor' ? (byId('vendedores', u.vendedorId) || {}).nome : u.papel === 'cliente' ? (byId('clientes', u.clienteId) || {}).fantasia : '—')],
    ['Último acesso', u => u.ultimoAcesso ? new Date(u.ultimoAcesso).toLocaleString('pt-BR') : '<span class="muted">nunca</span>'], ['Status', u => u.ativo === 'Não' ? '<span class="badge b-mut">Inativo</span>' : '<span class="badge b-ok">Ativo</span>']],
    db.usuarios.map(u => ({ ...u, _click: `editar('usuarios','${u.id}')` }))) +
    `<div class="card" style="margin-top:14px"><h3>Perfis de acesso</h3>
     <p><b>Administrador</b> — acesso total: faturamento, estoque, financeiro, NF-e, cadastros e usuários.</p>
     <p><b>Vendedor</b> — vê só a própria carteira de clientes; faz e aprova pedidos, consulta estoque, títulos e comissão. Não vê custos nem margens.</p>
     <p style="margin:0"><b>Cliente</b> — portal B2B: catálogo com os preços dele, envia pedidos (chegam como orçamento para aprovação), acompanha pedidos e boletos.</p></div>`;
};

/* ---------- Minha conta ---------- */
VIEWS.conta = () => {
  $('#view').innerHTML = `<div class="card" style="max-width:460px"><h3>Alterar senha</h3><form id="fs" onsubmit="event.preventDefault();trocarSenha()">
    <label>Senha atual</label><input name="atual" type="password" autocomplete="current-password" required>
    <label style="margin-top:10px">Nova senha (mín. 6 caracteres)</label><input name="nova" type="password" autocomplete="new-password" minlength="6" required>
    <div class="actions"><button class="btn pri">Salvar nova senha</button></div></form>
    <p class="hint">Logado como ${esc(db.me.email)}</p></div>`;
};
async function trocarSenha() {
  const r = await acao(() => api('POST', '/api/senha', Object.fromEntries(new FormData($('#fs')))), 'Senha alterada');
  if (r) setToken(r.token);
}

/* ---------- Configurações ---------- */
VIEWS.config = () => {
  const e = db.empresa;
  const campos = [['nome', 'Razão social', 'full'], ['fantasia', 'Nome fantasia'], ['cnpj', 'CNPJ'], ['ie', 'Inscrição estadual'], ['telefone', 'Telefone'], ['email', 'E-mail', 'full'],
    ['logradouro', 'Logradouro', 'full'], ['numero', 'Número'], ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['uf', 'UF'], ['cep', 'CEP']];
  $('#view').innerHTML = `<div class="grid half" style="align-items:start">
   <div class="card"><h3>Dados da empresa (emitente da NF-e)</h3><form id="emp" class="form">
    ${campos.map(([k, l, x]) => `<div class="${x || ''}"><label>${l}</label><input name="${k}" value="${esc(e[k])}"></div>`).join('')}</form>
    <div class="actions"><button class="btn pri" onclick="acao(()=>api('PUT','/api/empresa',Object.fromEntries(new FormData($('#emp')))),'Dados salvos')">Salvar</button></div></div>
   <div><div class="card"><h3>NF-e</h3><p>Emissor atual: <b>${db.nfeProvedor === 'simulado' ? 'Simulação (sem valor fiscal)' : esc(db.nfeProvedor)}</b></p>
     <p class="hint">Para emitir notas reais, contrate um emissor via API (o sistema já vem pronto para a Focus NFe), cadastre o certificado A1 da empresa nele e inicie o servidor com as variáveis <code>NFE_PROVEDOR=focusnfe</code>, <code>FOCUS_TOKEN</code> e <code>FOCUS_AMBIENTE</code>. Valide CFOP/CST com seu contador.</p></div>
    <div class="card" style="margin-top:14px"><h3>Backup e dados</h3><p class="muted">Os dados ficam no banco do servidor. Baixe backups periodicamente.</p>
    <div class="row" style="flex-wrap:wrap"><button class="btn" onclick="backup()">⬇ Baixar backup (.json)</button>
     <label class="btn" style="margin:0;color:var(--text);font-size:14px">⬆ Restaurar backup<input type="file" accept=".json" style="display:none" onchange="restaurar(this.files[0])"></label></div>
    <p class="hint">Também aceita o backup da versão anterior (offline) do DistribPro.</p>
    <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
    <div class="row" style="flex-wrap:wrap"><button class="btn danger" onclick="resetar('demo')">Recarregar dados demo</button><button class="btn danger" onclick="resetar('vazio')">Começar do zero (vazio)</button></div>
    <p class="hint">Os usuários administradores são mantidos.</p></div></div></div>`;
};
async function backup() {
  try { const r = await api('GET', '/api/backup'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(r.backup)], { type: 'application/json' })); a.download = 'distribpro-backup-' + today() + '.json'; a.click(); }
  catch (e) { alert(e.message); }
}
function restaurar(f) {
  if (!f || !confirm('Restaurar este backup substitui TODOS os dados atuais. Continuar?')) return;
  f.text().then(t => { let d; try { d = JSON.parse(t); } catch (e) { return alert('Arquivo inválido'); } acao(() => api('POST', '/api/restore', { backup: d }), 'Backup restaurado'); });
}
async function resetar(modo) {
  if (!confirm(modo === 'demo' ? 'Apagar TODOS os dados e carregar a demonstração?' : 'Apagar cadastros, pedidos, estoque e financeiro?')) return;
  if (await acao(() => api('POST', '/api/reset', { modo }), 'Pronto')) go('dashboard');
}
function exportCSV(col) {
  const sc = SCHEMAS[col]; const fs = sc.fields.filter(f => f[2] !== 'password');
  const lines = db[col].map(o => fs.map(([k, , t, x]) => { let v = o[k] ?? ''; if (t === 'select' && typeof x === 'function') { const m = x().find(a => a[0] === v); if (m) v = m[1]; } return '"' + String(v).replace(/"/g, '""') + '"'; }).join(';'));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + [fs.map(f => f[1]).join(';'), ...lines].join('\n')], { type: 'text/csv' })); a.download = col + '.csv'; a.click();
}

/* ================== INIT ================== */
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
// atualiza dados a cada 30s (pedidos novos de outros usuários)
setInterval(async () => {
  if (!db || modalAberto() || document.hidden) return;
  try { await api('GET', '/api/data'); rerender(); } catch (e) { }
}, 30000);
(async () => {
  if (!token) return telaLogin();
  try { await api('GET', '/api/data'); iniciarApp(); } catch (e) { if (e.status !== 401) telaLogin(e.message); }
})();
