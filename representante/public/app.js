/* RepCRM — front-end (sem build) */
'use strict';
const $ = s => document.querySelector(s);
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fdate = d => d ? d.slice(0, 10).split('-').reverse().join('/') : '';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const R = Regras, hoje = R.hoje, addDays = R.addDays;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = m => MESES[Number(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4);
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }

/* ================== ESTADO / API ================== */
let db = null, token = null, page = '', state = {};
try { token = localStorage.getItem('rc_token'); } catch (e) { }
const byId = (col, id) => (db[col] || []).find(x => x.id === id);
const nomeCli = id => { const c = byId('clientes', id); return c ? (c.fantasia || c.razao) : '—'; };
const nomeRep = id => { const r = byId('representadas', id); return r ? r.nome : '—'; };
const corRep = id => { const r = byId('representadas', id); return (r && r.cor) || 'var(--pri)'; };
const repTag = id => `<span class="rep-tag"><i style="background:${esc(corRep(id))}"></i>${esc(nomeRep(id))}</span>`;

async function api(method, url, body) {
  let r, j;
  try {
    r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    j = await r.json();
  } catch (e) { throw Object.assign(new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.'), { status: 0 }); }
  if (r.status === 401 && url !== '/api/login') { sair(true); throw Object.assign(new Error(j.erro), { status: 401 }); }
  if (!r.ok) throw Object.assign(new Error(j.erro || 'Erro'), { status: r.status });
  if (j.data) db = j.data;
  return j;
}
/** Executa no servidor, mostra o erro (se houver) e redesenha. */
async function acao(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); render(); return r; }
  catch (e) { if (e.status !== 401) alert(e.message); return null; }
}
function setToken(t) { token = t; try { t ? localStorage.setItem('rc_token', t) : localStorage.removeItem('rc_token'); } catch (e) { } }
function sair(expirou) { setToken(null); db = null; closeModal(); telaLogin(expirou ? 'Sua sessão expirou. Entre novamente.' : ''); }

/* ================== LOGIN ================== */
function telaLogin(msg) {
  $('#root').innerHTML = `<div class="login-wrap"><div class="card login">
    <div class="brand"><span>R</span>RepCRM</div>
    <form id="lg" onsubmit="event.preventDefault();entrar()">
      <label>E-mail</label><input name="email" type="email" autocomplete="username" required autofocus>
      <label style="margin-top:12px">Senha</label><input name="senha" type="password" autocomplete="current-password" required>
      <div id="lgErr" class="err">${esc(msg || '')}</div>
      <button class="btn pri" style="width:100%;justify-content:center;margin-top:6px">Entrar</button>
    </form>
    <p class="hint" style="margin-top:16px">CRM do representante comercial: clientes, representadas, funil, agenda, pedidos e comissões.</p>
  </div></div>`;
}
async function entrar() {
  const f = Object.fromEntries(new FormData($('#lg')));
  try { const r = await api('POST', '/api/login', f); setToken(r.token); iniciarApp(); }
  catch (e) { $('#lgErr').textContent = e.message; }
}

/* ================== LAYOUT ================== */
const PAGES = [['sep', 'Dia a dia'], ['painel', '📊', 'Painel'], ['agenda', '📅', 'Agenda'], ['funil', '🎯', 'Funil de vendas'], ['clientes', '🏪', 'Clientes'],
  ['sep', 'Vendas'], ['pedidos', '🧾', 'Pedidos'], ['comissoes', '💰', 'Comissões'], ['relatorios', '📈', 'Relatórios'],
  ['sep', 'Cadastros'], ['representadas', '🏭', 'Representadas'], ['produtos', '📦', 'Produtos e preços'], ['config', '⚙️', 'Configurações']];
function iniciarApp() {
  $('#root').innerHTML = `<div class="app"><aside id="side"><div class="brand"><span>R</span>RepCRM</div><nav id="nav"></nav>
    <div class="user-box"><b>${esc(db.me.nome)}</b>${esc(db.config.empresa || '')}<br><a class="lnk" onclick="sair()">Sair</a></div></aside>
    <main><div class="top"><button class="btn menu-btn" onclick="$('#side').classList.toggle('open')">☰</button><h1 id="title"></h1><div id="topActions" class="row wrap"></div></div><div id="view"></div></main></div>`;
  const h = location.hash.slice(1);
  page = PAGES.some(p => p[0] === h) ? h : 'painel';
  render();
}
function renderNav() {
  const pend = db.atividades.filter(a => a.status !== 'Concluída' && a.data <= hoje()).length;
  $('#nav').innerHTML = PAGES.map(p => p[0] === 'sep' ? `<div class="sep">${p[1]}</div>` :
    `<a class="${page === p[0] ? 'active' : ''}" onclick="go('${p[0]}')"><span>${p[1]}</span>${p[2]}${p[0] === 'agenda' && pend ? `<em class="cnt">${pend}</em>` : ''}</a>`).join('');
}
function go(p) { page = p; state = {}; $('#side').classList.remove('open'); location.hash = p; render(); window.scrollTo(0, 0); }
function render() {
  if (!db || !$('#view')) return;
  renderNav(); $('#topActions').innerHTML = '';
  const pg = PAGES.find(x => x[0] === page); $('#title').textContent = pg ? pg[2] : '';
  (VIEWS[page] || VIEWS.painel)();
  if (state.modalRefresh && modalAberto()) state.modalRefresh();
}
const setActions = html => $('#topActions').innerHTML = html;
function closeModal() { $('#modal').innerHTML = ''; state.modalRefresh = null; document.body.classList.remove('has-modal'); }
/** Janela aberta por cima de outra (ex.: editar atividade dentro da ficha do cliente): ao terminar, volta para a de baixo. */
let voltarPara = null;
function subModal() { voltarPara = state.modalRefresh || null; state.modalRefresh = null; }
function fimSub(depois) { const v = voltarPara; voltarPara = null; closeModal(); if (depois) depois(); else if (v) v(); }
function openModal(html, wide) { document.body.classList.add('has-modal'); $('#modal').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`; }
const modalAberto = () => !!$('#modal').innerHTML;
window.addEventListener('keydown', e => { if (e.key === 'Escape' && modalAberto()) closeModal(); });

/* ================== FORMULÁRIOS GENÉRICOS ================== */
const opts = (col, lab, filtro) => () => (db[col] || []).filter(filtro || (() => true)).map(x => [x.id, typeof lab === 'function' ? lab(x) : x[lab]]);
const lista = a => () => a.map(x => [x, x]);
const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
const cliLab = c => (c.fantasia || c.razao) + (c.cidade ? ' — ' + c.cidade : '');
const SCHEMAS = {
  clientes: { titulo: 'Cliente', fields: [
    ['razao', 'Razão social *', 'text', null, 'full'], ['fantasia', 'Nome fantasia'], ['cnpj', 'CNPJ/CPF'], ['ie', 'Inscrição estadual'],
    ['status', 'Situação', 'select', lista(R.STATUS_CLIENTE)], ['segmento', 'Segmento'], ['origem', 'Origem', 'select', lista(['', 'Indicação', 'Visita fria', 'Feira', 'Representada', 'Internet', 'Outro'])],
    ['contato', 'Contato (comprador)'], ['cargo', 'Cargo'], ['aniversario', 'Aniversário do contato (dd/mm)'], ['telefone', 'Telefone'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'],
    ['cep', 'CEP'], ['logradouro', 'Endereço', 'text', null, 'full'], ['numero', 'Número'], ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['uf', 'UF', 'select', lista(['', ...UFS])],
    ['cicloCompra', 'Compra a cada (dias) — alerta de reativação', 'number'], ['obs', 'Observações', 'textarea', null, 'full']] },
  representadas: { titulo: 'Representada', fields: [
    ['nome', 'Nome (como você chama) *'], ['razao', 'Razão social'], ['cnpj', 'CNPJ'], ['segmento', 'Segmento / linha'],
    ['comissao', 'Comissão padrão (%)', 'number'], ['baseComissao', 'Comissão paga sobre', 'select', () => [['Faturamento', 'Faturamento (parcela única)'], ['Pagamento', 'Pagamento do cliente (por parcela)']]],
    ['diasComissao', 'Dias até pagar a comissão', 'number'], ['metaMensal', 'Meta mensal de vendas (R$)', 'number'], ['pedidoMinimo', 'Pedido mínimo (R$)', 'number'], ['condicoes', 'Condição padrão (ex.: 28/42/56)'],
    ['contato', 'Contato na representada'], ['telefone', 'Telefone'], ['email', 'E-mail para pedidos'], ['site', 'Site / portal B2B'], ['cor', 'Cor', 'color'], ['ativo', 'Ativa', 'select', lista(['Sim', 'Não'])],
    ['obs', 'Observações (política comercial, regras de desconto...)', 'textarea', null, 'full']] },
  produtos: { titulo: 'Produto', fields: [
    ['representadaId', 'Representada *', 'select', opts('representadas', 'nome')], ['codigo', 'Código'], ['descricao', 'Descrição *', 'text', null, 'full'],
    ['unidade', 'Unidade'], ['embalagem', 'Embalagem (múltiplo de venda)', 'number'], ['preco', 'Preço de tabela (R$)', 'number'], ['ipi', 'IPI (%)', 'number'],
    ['comissao', 'Comissão específica (%) — vazio/0 usa a da representada', 'number'], ['ean', 'EAN'], ['ativo', 'Ativo', 'select', lista(['Sim', 'Não'])]] },
  oportunidades: { titulo: 'Oportunidade', fields: [
    ['titulo', 'Título *', 'text', null, 'full'], ['clienteId', 'Cliente *', 'select', opts('clientes', cliLab)], ['representadaId', 'Representada', 'select', () => [['', '—'], ...opts('representadas', 'nome')()]],
    ['valor', 'Valor estimado (R$)', 'number'], ['etapa', 'Etapa', 'select', lista(R.ETAPAS)], ['probabilidade', 'Probabilidade (%)', 'number'], ['previsao', 'Previsão de fechamento', 'date'],
    ['motivoPerda', 'Motivo da perda (se perdida)'], ['obs', 'Observações', 'textarea', null, 'full']] },
  atividades: { titulo: 'Atividade', fields: [
    ['tipo', 'Tipo', 'select', lista(R.TIPOS)], ['data', 'Data *', 'date'], ['hora', 'Hora', 'time'], ['clienteId', 'Cliente', 'select', () => [['', '— sem cliente —'], ...opts('clientes', cliLab)()]],
    ['assunto', 'Assunto *', 'text', null, 'full'], ['oportunidadeId', 'Oportunidade', 'select', () => [['', '—'], ...opts('oportunidades', 'titulo', o => !['Ganha', 'Perdida'].includes(o.etapa))()]],
    ['status', 'Situação', 'select', lista(['Pendente', 'Concluída'])], ['descricao', 'Detalhes', 'textarea', null, 'full'], ['resultado', 'Resultado / o que foi conversado', 'textarea', null, 'full']] },
  usuarios: { titulo: 'Usuário', fields: [['nome', 'Nome'], ['email', 'E-mail *', 'email'], ['senha', 'Senha (deixe em branco para manter)', 'password'], ['ativo', 'Ativo', 'select', lista(['Sim', 'Não'])]] },
};
function campo([k, lab, tipo = 'text', op, cls], o) {
  const v = o[k] ?? '';
  let inp;
  if (tipo === 'select') inp = `<select name="${k}">${op().map(([val, t]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(t || '—')}</option>`).join('')}</select>`;
  else if (tipo === 'textarea') inp = `<textarea name="${k}" rows="3">${esc(v)}</textarea>`;
  else inp = `<input name="${k}" type="${tipo}" ${tipo === 'number' ? 'step="any"' : ''} value="${tipo === 'password' ? '' : esc(v)}" ${tipo === 'password' ? 'autocomplete="new-password"' : ''}>`;
  return `<div class="${cls || ''}"><label>${esc(lab)}</label>${inp}</div>`;
}
/** Abre o formulário de cadastro; depois(id) roda após salvar. */
function editar(col, id, padrao = {}, depois) {
  const sc = SCHEMAS[col], o = id ? byId(col, id) : { ...padrao };
  subModal();
  openModal(`<h2>${id ? 'Editar' : 'Novo(a)'} ${sc.titulo.toLowerCase()}</h2>
    <form id="frm" class="form" onsubmit="event.preventDefault()">${sc.fields.map(f => campo(f, o)).join('')}</form>
    <div class="actions">${id ? `<button class="btn danger" onclick="excluir('${col}','${id}')">Excluir</button>` : ''}<span style="flex:1"></span>
      <button class="btn" onclick="fimSub()">Cancelar</button><button class="btn pri" id="btnSalvar">Salvar</button></div>`);
  $('#btnSalvar').onclick = async () => {
    const f = Object.fromEntries(new FormData($('#frm'))); if (id) f.id = id;
    if (col === 'oportunidades' && id && f.etapa !== o.etapa && String(f.probabilidade) === String(o.probabilidade)) f.probabilidade = R.PROB[f.etapa];
    const r = await acao(() => api('PUT', '/api/crud/' + col, f), 'Salvo');
    if (r) fimSub(depois && (() => depois(r.id)));
  };
}
async function excluir(col, id) {
  const extra = col === 'clientes' ? ' As atividades e oportunidades dele também serão apagadas.' : '';
  if (!confirm('Excluir este registro?' + extra)) return;
  if (await acao(() => api('DELETE', `/api/crud/${col}/${id}`), 'Excluído')) fimSub();
}
const fone = t => String(t || '').replace(/\D/g, '');
const zap = (t, msg = '') => { let n = fone(t); if (!n) return ''; if (n.length <= 11) n = '55' + n; return `https://wa.me/${n}${msg ? '?text=' + encodeURIComponent(msg) : ''}`; };
function contatos(c) {
  if (!c) return '';
  return `<span class="row wrap gap4">${c.whatsapp ? `<a class="btn sm" target="_blank" rel="noopener" href="${zap(c.whatsapp)}">💬 WhatsApp</a>` : ''}
    ${c.telefone ? `<a class="btn sm" href="tel:${fone(c.telefone)}">📞 ${esc(c.telefone)}</a>` : ''}${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}">✉️ E-mail</a>` : ''}</span>`;
}
function tabela(cols, linhas, vazio = 'Nada por aqui ainda.') {
  if (!linhas.length) return `<div class="card empty">${vazio}</div>`;
  return `<div class="tbl-wrap"><table><thead><tr>${cols.map(c => `<th class="${/^(Valor|Total|Comiss|Qtd|%|Preço|IPI|Meta|Vendido|Ticket|Pedidos|Dias)/.test(c) ? 'num' : ''}">${c}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`;
}
function baixarArquivo(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function csv(nome, cab, linhas) {
  const q = v => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  baixarArquivo(nome, '﻿' + [cab, ...linhas].map(l => l.map(q).join(';')).join('\n'));
}

/* ================== CÁLCULOS ================== */
const vendasValidas = () => db.pedidos.filter(R.faturado);
const ultimoPedido = cid => db.pedidos.filter(p => p.clienteId === cid && p.status !== 'Cancelado' && p.status !== 'Orçamento').reduce((m, p) => p.data > m ? p.data : m, '');
function paraReativar() {
  return db.clientes.filter(c => c.status === 'Ativo').map(c => {
    const u = ultimoPedido(c.id), ciclo = Number(c.cicloCompra) || 45;
    return { c, u, dias: u ? R.diasEntre(u, hoje()) : null, ciclo };
  }).filter(x => x.dias === null || x.dias > x.ciclo).sort((a, b) => (b.dias ?? 9999) - (a.dias ?? 9999));
}
const mesAtual = () => hoje().slice(0, 7);
const faturadoNoMes = (m, repId) => vendasValidas().filter(p => (p.dataFaturamento || '').startsWith(m) && (!repId || p.representadaId === repId)).reduce((s, p) => s + R.valorVenda(p), 0);
function graficoBarras(serie, fmt = brl) {
  // serie: [{rotulo, valor, dica}] — uma série só, então sem legenda; o título do cartão nomeia o que é.
  const W = 640, H = 200, pl = 58, pb = 22, pt = 10, max = Math.max(1, ...serie.map(s => s.valor));
  const passo = (W - pl - 4) / serie.length, bw = Math.min(34, passo * 0.62);
  const ticks = [0, 0.5, 1].map(f => f * max);
  const y = v => pt + (H - pt - pb) * (1 - v / max);
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de barras">
    ${ticks.map(t => `<line x1="${pl}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${t ? compacto(t) : '0'}</text>`).join('')}
    ${serie.map((s, i) => { const x = pl + i * passo + (passo - bw) / 2, h = Math.max(0, H - pb - y(s.valor)), r = Math.min(4, h / 2);
      return `<g class="hit" data-tip="${esc(s.dica || s.rotulo + ': ' + fmt(s.valor))}"><rect x="${pl + i * passo}" y="0" width="${passo}" height="${H - pb}" fill="transparent"/>
        ${h > 0 ? `<path class="barra" d="M${x},${H - pb} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z"/>` : ''}
        <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(s.rotulo)}</text></g>`; }).join('')}
  </svg><div class="tip" hidden></div></div>`;
}
document.addEventListener('mousemove', e => {
  const g = e.target.closest && e.target.closest('.hit'), ch = e.target.closest && e.target.closest('.chart');
  document.querySelectorAll('.chart .tip').forEach(t => { if (!ch || t.parentNode !== ch) t.hidden = true; });
  if (!g || !ch) return;
  const t = ch.querySelector('.tip'), b = ch.getBoundingClientRect();
  t.textContent = g.dataset.tip; t.hidden = false;
  t.style.left = Math.min(b.width - t.offsetWidth - 4, Math.max(0, e.clientX - b.left + 12)) + 'px'; t.style.top = Math.max(0, e.clientY - b.top - 36) + 'px';
});
const compacto = v => v >= 1e6 ? 'R$ ' + num(v / 1e6, 1) + ' mi' : v >= 1e3 ? 'R$ ' + num(v / 1e3, 0) + ' mil' : brl(v);
const barra = (v, meta) => { const p = meta > 0 ? Math.min(100, v / meta * 100) : 0; return `<div class="bar"><i style="width:${p}%"></i></div>`; };

/* ================== VIEWS ================== */
const VIEWS = {};

VIEWS.painel = () => {
  const m = mesAtual(), H = hoje();
  const fatMes = faturadoNoMes(m);
  const pedMes = db.pedidos.filter(p => p.data.startsWith(m) && p.status !== 'Cancelado' && p.status !== 'Orçamento');
  const parc = R.parcelas(db);
  const aReceber = parc.filter(c => !c.recebida), atrasadas = aReceber.filter(c => c.venc < H);
  const recebMes = parc.filter(c => c.recebida && c.recebidaEm.startsWith(m)).reduce((s, c) => s + c.valorRecebido, 0);
  const abertas = db.oportunidades.filter(o => !['Ganha', 'Perdida'].includes(o.etapa));
  const ponderado = abertas.reduce((s, o) => s + o.valor * o.probabilidade / 100, 0);
  const aguardando = db.pedidos.filter(p => p.status === 'Enviado');
  const metaTotal = db.representadas.filter(r => r.ativo !== 'Não').reduce((s, r) => s + (Number(r.metaMensal) || 0), 0);
  const pend = db.atividades.filter(a => a.status !== 'Concluída' && a.data <= H).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  const reat = paraReativar();
  const meses = Array.from({ length: 12 }, (_, i) => R.addMeses(m, i - 11));
  const aniv = db.clientes.filter(c => /^\d{2}\/\d{2}/.test(c.aniversario || '')).filter(c => { const [d, mm] = c.aniversario.split('/'); const dt = `${H.slice(0, 4)}-${mm}-${d}`; const k = R.diasEntre(H, dt); return k >= 0 && k <= 7; });
  setActions(`<button class="btn" onclick="novaAtividade()">+ Atividade</button><button class="btn pri" onclick="novoPedido()">+ Pedido</button>`);
  $('#view').innerHTML = `
  <div class="grid kpis">
    <div class="card kpi"><div class="l">Faturado no mês</div><div class="v">${brl(fatMes)}</div>${metaTotal ? `<div class="s">${num(fatMes / metaTotal * 100)}% da meta de ${brl(metaTotal)}</div>${barra(fatMes, metaTotal)}` : '<div class="s">defina metas nas representadas</div>'}</div>
    <div class="card kpi"><div class="l">Pedidos tirados no mês</div><div class="v">${pedMes.length}</div><div class="s">${brl(pedMes.reduce((s, p) => s + R.totais(p).mercadoria, 0))} · ${aguardando.length} aguardando faturamento</div></div>
    <div class="card kpi clic" onclick="go('comissoes')"><div class="l">Comissão a receber</div><div class="v">${brl(aReceber.reduce((s, c) => s + c.valor, 0))}</div><div class="s">${atrasadas.length ? `<span class="t-bad">⚠ ${brl(atrasadas.reduce((s, c) => s + c.valor, 0))} atrasada</span> · ` : ''}recebido no mês: ${brl(recebMes)}</div></div>
    <div class="card kpi clic" onclick="go('funil')"><div class="l">Funil em aberto</div><div class="v">${brl(abertas.reduce((s, o) => s + o.valor, 0))}</div><div class="s">${abertas.length} oportunidades · ponderado ${brl(ponderado)}</div></div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card"><h3>Para fazer hoje ${pend.length ? `<span class="badge">${pend.length}</span>` : ''}</h3>${pend.length ? pend.slice(0, 12).map(itemAgenda).join('') : '<p class="muted">Agenda em dia. 🎉</p>'}
      ${pend.length > 12 ? `<a class="lnk" onclick="go('agenda')">ver todas</a>` : ''}</div>
    <div class="card"><h3>Meta do mês por representada</h3>${db.representadas.filter(r => r.ativo !== 'Não').map(r => { const v = faturadoNoMes(m, r.id);
      return `<div style="margin-bottom:12px"><div class="row" style="justify-content:space-between">${repTag(r.id)}<span class="muted">${brl(v)}${r.metaMensal ? ' / ' + brl(r.metaMensal) : ''}</span></div>${r.metaMensal ? barra(v, r.metaMensal) : ''}</div>`; }).join('') || '<p class="muted">Cadastre as representadas.</p>'}</div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card"><h3>Faturamento dos últimos 12 meses</h3>${graficoBarras(meses.map(mm => ({ rotulo: nomeMes(mm).slice(0, 3), valor: faturadoNoMes(mm), dica: nomeMes(mm) + ': ' + brl(faturadoNoMes(mm)) })))}</div>
    <div class="card"><h3>Clientes para reativar <span class="badge b-warn">${reat.length}</span></h3><p class="hint" style="margin-top:-6px">Ativos que passaram do ciclo de compra sem pedido.</p>
      ${reat.slice(0, 8).map(x => `<div class="list-item"><div><a class="lnk" onclick="fichaCliente('${x.c.id}')">${esc(x.c.fantasia || x.c.razao)}</a><div class="hint">${x.u ? `último pedido há ${x.dias} dias (${fdate(x.u)}) · ciclo ${x.ciclo}d` : 'nunca comprou'}</div></div>
        <button class="btn sm" onclick="novaAtividade({clienteId:'${x.c.id}',tipo:'Ligação',assunto:'Reativar cliente'})">Agendar</button></div>`).join('') || '<p class="muted">Ninguém atrasado. 👏</p>'}
      ${aniv.length ? `<h3 style="margin-top:16px">🎂 Aniversários nos próximos 7 dias</h3>${aniv.map(c => `<div class="list-item"><span>${esc(c.contato)} · ${esc(c.fantasia || c.razao)} (${esc(c.aniversario)})</span>${c.whatsapp ? `<a class="btn sm" target="_blank" rel="noopener" href="${zap(c.whatsapp, `Feliz aniversário, ${c.contato}! 🎉`)}">💬</a>` : ''}</div>`).join('')}` : ''}
    </div>
  </div>`;
};

/* ---------- Agenda ---------- */
const ICONE = { 'Ligação': '📞', 'WhatsApp': '💬', 'Visita': '🚗', 'E-mail': '✉️', 'Reunião': '🤝', 'Tarefa': '✅' };
function itemAgenda(a) {
  const c = byId('clientes', a.clienteId), atras = a.status !== 'Concluída' && a.data < hoje();
  return `<div class="list-item ag ${a.status === 'Concluída' ? 'feito' : ''}">
    <div class="ag-ico">${ICONE[a.tipo] || '•'}</div>
    <div style="flex:1;min-width:0"><div><b class="lnk" onclick="editar('atividades','${a.id}')">${esc(a.assunto)}</b> ${atras ? '<span class="badge b-bad">atrasada</span>' : ''}</div>
      <div class="hint">${fdate(a.data)}${a.hora ? ' ' + esc(a.hora) : ''} · ${esc(a.tipo)}${c ? ` · <a class="lnk" onclick="fichaCliente('${c.id}')">${esc(c.fantasia || c.razao)}</a>` : ''}</div>
      ${a.resultado ? `<div class="hint">↳ ${esc(a.resultado)}</div>` : ''}</div>
    <div class="row gap4">${a.status !== 'Concluída' && c && a.tipo === 'WhatsApp' && c.whatsapp ? `<a class="btn sm" target="_blank" rel="noopener" href="${zap(c.whatsapp)}">💬</a>` : ''}
      ${a.status !== 'Concluída' && c && a.tipo === 'Ligação' && c.telefone ? `<a class="btn sm" href="tel:${fone(c.telefone)}">📞</a>` : ''}
      ${a.status === 'Concluída' ? `<button class="btn sm" title="Reabrir" onclick="acao(()=>api('POST','/api/atividades/${a.id}/concluir',{reabrir:true}))">↺</button>` : `<button class="btn sm ok" onclick="concluir('${a.id}')">✓ Concluir</button>`}</div></div>`;
}
function novaAtividade(padrao = {}) { editar('atividades', null, { tipo: 'Ligação', data: hoje(), status: 'Pendente', ...padrao }); }
function concluir(id) {
  const a = byId('atividades', id);
  subModal();
  openModal(`<h2>Concluir: ${esc(a.assunto)}</h2>
    <label>Resultado / o que foi conversado</label><textarea id="cRes" rows="3">${esc(a.resultado || '')}</textarea>
    <div class="card" style="margin-top:14px;background:var(--panel2)"><label class="chk"><input type="checkbox" id="cProx" ${a.clienteId ? 'checked' : ''}> Agendar o próximo contato</label>
      <div class="form" style="margin-top:8px"><div><label>Tipo</label><select id="cTipo">${R.TIPOS.map(t => `<option ${t === a.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div><label>Data</label><input id="cData" type="date" value="${addDays(hoje(), 7)}"></div><div><label>Hora</label><input id="cHora" type="time"></div>
      <div class="full"><label>Assunto</label><input id="cAss" value="${esc('Retorno: ' + a.assunto.replace(/^Retorno: /, ''))}"></div></div>
      <div class="row wrap gap4" style="margin-top:8px">${[[2, '2 dias'], [7, '1 semana'], [15, '15 dias'], [30, '30 dias']].map(([d, t]) => `<button class="btn sm" onclick="$('#cData').value='${addDays(hoje(), d)}'">${t}</button>`).join('')}</div></div>
    <div class="actions"><button class="btn" onclick="fimSub()">Cancelar</button><button class="btn pri" id="cOk">Concluir</button></div>`);
  $('#cOk').onclick = async () => {
    const body = { resultado: $('#cRes').value };
    if ($('#cProx').checked) body.proxima = { tipo: $('#cTipo').value, data: $('#cData').value, hora: $('#cHora').value, assunto: $('#cAss').value };
    if (await acao(() => api('POST', `/api/atividades/${id}/concluir`, body), body.proxima ? 'Concluída e próximo contato agendado' : 'Concluída')) fimSub();
  };
}
VIEWS.agenda = () => {
  const s = state; s.ver = s.ver || 'abertas'; s.tipo = s.tipo || '';
  setActions(`<button class="btn pri" onclick="novaAtividade()">+ Atividade</button>`);
  const H = hoje(), fim = addDays(H, 6);
  let at = db.atividades.filter(a => !s.tipo || a.tipo === s.tipo);
  const grupos = [];
  if (s.ver === 'abertas') {
    at = at.filter(a => a.status !== 'Concluída').sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    grupos.push(['⚠ Atrasadas', at.filter(a => a.data < H)], ['Hoje', at.filter(a => a.data === H)], ['Próximos 7 dias', at.filter(a => a.data > H && a.data <= fim)], ['Mais adiante', at.filter(a => a.data > fim)]);
  } else grupos.push(['Concluídas (mais recentes)', at.filter(a => a.status === 'Concluída').sort((a, b) => (b.concluidaEm || b.data).localeCompare(a.concluidaEm || a.data)).slice(0, 200)]);
  $('#view').innerHTML = `<div class="filters"><select onchange="state.ver=this.value;render()"><option value="abertas">Pendentes</option><option value="feitas" ${s.ver === 'feitas' ? 'selected' : ''}>Concluídas</option></select>
    <select onchange="state.tipo=this.value;render()"><option value="">Todos os tipos</option>${R.TIPOS.map(t => `<option ${t === s.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    ${grupos.filter(g => g[1].length).map(([t, l]) => `<div class="card" style="margin-bottom:14px"><h3>${t} <span class="badge b-mut">${l.length}</span></h3>${l.map(itemAgenda).join('')}</div>`).join('') || '<div class="card empty">Nenhuma atividade.</div>'}`;
};

/* ---------- Funil ---------- */
VIEWS.funil = () => {
  const s = state; s.rep = s.rep || '';
  setActions(`<button class="btn pri" onclick="editar('oportunidades',null,{etapa:'Prospecção',probabilidade:10,previsao:addDays(hoje(),30)})">+ Oportunidade</button>`);
  const ops = db.oportunidades.filter(o => !s.rep || o.representadaId === s.rep);
  const limite = addDays(hoje(), -60);
  $('#view').innerHTML = `<div class="filters"><select onchange="state.rep=this.value;render()"><option value="">Todas as representadas</option>${db.representadas.map(r => `<option value="${r.id}" ${r.id === s.rep ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select>
    <span class="hint" style="align-self:center">Arraste os cartões entre as colunas (no celular, use o menu de cada cartão). Ganhas/perdidas: últimos 60 dias.</span></div>
  <div class="kanban">${R.ETAPAS.map(et => {
    const l = ops.filter(o => o.etapa === et && (!['Ganha', 'Perdida'].includes(et) || (o.fechadaEm || '') >= limite)).sort((a, b) => (a.previsao || '').localeCompare(b.previsao || ''));
    return `<div class="col" data-etapa="${et}" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="soltar(event,this)">
      <div class="col-h"><b>${et}</b><span class="muted">${l.length} · ${brl(l.reduce((t, o) => t + o.valor, 0))}</span></div>
      ${l.map(o => `<div class="op" draggable="true" ondragstart="event.dataTransfer.setData('text',this.dataset.id)" data-id="${o.id}">
        <div class="lnk" onclick="editar('oportunidades','${o.id}')"><b>${esc(o.titulo)}</b></div>
        <div class="hint"><a class="lnk" onclick="fichaCliente('${o.clienteId}')">${esc(nomeCli(o.clienteId))}</a></div>
        ${o.representadaId ? `<div style="margin:4px 0">${repTag(o.representadaId)}</div>` : ''}
        <div class="row" style="justify-content:space-between"><b>${brl(o.valor)}</b><span class="hint">${o.probabilidade}%${o.previsao ? ' · ' + fdate(o.previsao) : ''}</span></div>
        ${o.previsao && o.previsao < hoje() && !['Ganha', 'Perdida'].includes(o.etapa) ? '<span class="badge b-warn">previsão vencida</span>' : ''}
        ${o.etapa === 'Perdida' && o.motivoPerda ? `<div class="hint">✗ ${esc(o.motivoPerda)}</div>` : ''}
        <div class="row gap4" style="margin-top:6px"><select class="mini" onchange="moverOp('${o.id}',this.value)">${R.ETAPAS.map(e => `<option ${e === o.etapa ? 'selected' : ''}>${e}</option>`).join('')}</select>
          ${o.pedidoId ? `<button class="btn sm" onclick="verPedido('${o.pedidoId}')">Pedido</button>` : (o.etapa !== 'Perdida' ? `<button class="btn sm" title="Gerar pedido" onclick="novoPedido({clienteId:'${o.clienteId}',representadaId:'${o.representadaId}',oportunidadeId:'${o.id}'})">🧾</button>` : '')}
          <button class="btn sm" title="Agendar atividade" onclick="novaAtividade({clienteId:'${o.clienteId}',oportunidadeId:'${o.id}',assunto:'Follow-up: ${esc(o.titulo).replace(/'/g, '')}'})">📅</button></div>
      </div>`).join('')}</div>`; }).join('')}</div>`;
};
function soltar(ev, col) { ev.preventDefault(); col.classList.remove('over'); const id = ev.dataTransfer.getData('text'); if (id) moverOp(id, col.dataset.etapa); }
async function moverOp(id, etapa) {
  const o = byId('oportunidades', id); if (!o || o.etapa === etapa) return;
  let motivoPerda;
  if (etapa === 'Perdida') { motivoPerda = prompt('Por que perdeu esta oportunidade? (preço, prazo, concorrente, sem verba...)', o.motivoPerda || ''); if (!motivoPerda) return render(); }
  await acao(() => api('POST', `/api/oportunidades/${id}/etapa`, { etapa, motivoPerda }), 'Movida para ' + etapa);
  if (etapa === 'Ganha' && !o.pedidoId && confirm('Oportunidade ganha! Quer já lançar o pedido?')) novoPedido({ clienteId: o.clienteId, representadaId: o.representadaId, oportunidadeId: o.id });
}

/* ---------- Clientes ---------- */
VIEWS.clientes = () => {
  const s = state; s.q = s.q ?? ''; s.st = s.st ?? '';
  setActions(`<button class="btn" onclick="exportarClientes()">⬇ CSV</button><button class="btn pri" onclick="editar('clientes',null,{status:'Prospect',cicloCompra:45},fichaCliente)">+ Cliente</button>`);
  const q = s.q.toLowerCase();
  const l = db.clientes.filter(c => (!s.st || c.status === s.st) && (!q || [c.razao, c.fantasia, c.cnpj, c.cidade, c.contato, c.segmento].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (a.fantasia || a.razao).localeCompare(b.fantasia || b.razao));
  const ano = addDays(hoje(), -365);
  $('#view').innerHTML = `<div class="filters"><input placeholder="🔍 Buscar nome, CNPJ, cidade, contato..." value="${esc(s.q)}" oninput="state.q=this.value;clearTimeout(window._q);window._q=setTimeout(()=>{render();const i=document.querySelector('.filters input');i.focus();i.setSelectionRange(i.value.length,i.value.length)},250)">
    <select onchange="state.st=this.value;render()"><option value="">Todas as situações</option>${R.STATUS_CLIENTE.map(x => `<option ${x === s.st ? 'selected' : ''}>${x}</option>`).join('')}</select><span class="hint" style="align-self:center">${l.length} cliente(s)</span></div>
  ${tabela(['Cliente', 'Cidade', 'Contato', 'Situação', 'Último pedido', 'Vendido 12 meses', ''], l.map(c => {
    const u = ultimoPedido(c.id), v = vendasValidas().filter(p => p.clienteId === c.id && p.data >= ano).reduce((t, p) => t + R.valorVenda(p), 0);
    return `<tr><td><a class="lnk" onclick="fichaCliente('${c.id}')"><b>${esc(c.fantasia || c.razao)}</b></a><div class="hint">${esc(c.razao)}${c.segmento ? ' · ' + esc(c.segmento) : ''}</div></td>
      <td>${esc(c.cidade)}${c.uf ? '/' + esc(c.uf) : ''}</td><td>${esc(c.contato)}<div class="hint">${esc(c.whatsapp || c.telefone)}</div></td>
      <td><span class="badge ${{ Ativo: 'b-ok', Prospect: '', Inativo: 'b-mut' }[c.status]}">${esc(c.status)}</span></td><td>${u ? fdate(u) + `<div class="hint">há ${R.diasEntre(u, hoje())} dias</div>` : '<span class="muted">—</span>'}</td>
      <td class="num">${brl(v)}</td><td>${c.whatsapp ? `<a class="btn sm" target="_blank" rel="noopener" href="${zap(c.whatsapp)}">💬</a>` : ''}</td></tr>`; }), 'Nenhum cliente encontrado.')}`;
};
function exportarClientes() {
  csv('clientes.csv', ['Razão social', 'Fantasia', 'CNPJ', 'Situação', 'Segmento', 'Contato', 'Telefone', 'WhatsApp', 'E-mail', 'Cidade', 'UF', 'Último pedido'],
    db.clientes.map(c => [c.razao, c.fantasia, c.cnpj, c.status, c.segmento, c.contato, c.telefone, c.whatsapp, c.email, c.cidade, c.uf, fdate(ultimoPedido(c.id))]));
}
function fichaCliente(id) {
  const desenhar = () => {
    const c = byId('clientes', id); if (!c) return closeModal();
    const peds = db.pedidos.filter(p => p.clienteId === id).sort((a, b) => b.data.localeCompare(a.data));
    const vendas = peds.filter(R.faturado), total = vendas.reduce((s, p) => s + R.valorVenda(p), 0);
    const reps = [...new Set(vendas.map(p => p.representadaId))];
    const ops = db.oportunidades.filter(o => o.clienteId === id);
    const tl = [
      ...db.atividades.filter(a => a.clienteId === id).map(a => ({ d: a.data + (a.hora || ''), html: `<div class="tl ${a.status === 'Concluída' ? '' : 'pend'}"><b>${ICONE[a.tipo]} ${esc(a.assunto)}</b> <span class="hint">${fdate(a.data)} ${esc(a.hora || '')} · ${a.status}</span>${a.resultado ? `<div>${esc(a.resultado)}</div>` : ''}<a class="lnk hint" onclick="editar('atividades','${a.id}')">editar</a>${a.status !== 'Concluída' ? ` · <a class="lnk hint" onclick="concluir('${a.id}')">concluir</a>` : ''}</div>` })),
      ...peds.map(p => ({ d: p.data, html: `<div class="tl ped"><b>🧾 Pedido #${p.numero}</b> ${repTag(p.representadaId)} <span class="hint">${fdate(p.data)} · ${p.status} · ${brl(R.totais(p).total)}</span> <a class="lnk hint" onclick="verPedido('${p.id}')">abrir</a></div>` })),
    ].sort((a, b) => b.d.localeCompare(a.d));
    const end = [c.logradouro, c.numero, c.bairro, c.cidade && c.cidade + (c.uf ? '/' + c.uf : ''), c.cep].filter(Boolean).join(', ');
    openModal(`<div class="row wrap" style="justify-content:space-between"><h2 style="margin:0">${esc(c.fantasia || c.razao)} <span class="badge ${{ Ativo: 'b-ok', Prospect: '', Inativo: 'b-mut' }[c.status]}">${c.status}</span></h2>
        <div class="row gap4"><button class="btn sm" onclick="editar('clientes','${id}',{},fichaCliente)">✏️ Editar</button><button class="btn sm" onclick="closeModal()">✕</button></div></div>
      <p class="muted" style="margin:4px 0 10px">${esc(c.razao)}${c.cnpj ? ' · CNPJ ' + esc(c.cnpj) : ''}${c.segmento ? ' · ' + esc(c.segmento) : ''}</p>
      <div class="grid half"><div><div><b>${esc(c.contato || '—')}</b> ${c.cargo ? `<span class="muted">(${esc(c.cargo)})</span>` : ''}</div>
        ${end ? `<div class="hint">📍 <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end)}">${esc(end)}</a></div>` : ''}
        <div style="margin-top:8px">${contatos(c)}</div>${c.obs ? `<div class="note">${esc(c.obs)}</div>` : ''}</div>
        <div class="grid kpis mini-k"><div class="kpi"><div class="l">Total comprado</div><div class="v">${brl(total)}</div></div><div class="kpi"><div class="l">Pedidos</div><div class="v">${vendas.length}</div><div class="s">ticket ${brl(vendas.length ? total / vendas.length : 0)}</div></div>
          <div class="kpi"><div class="l">Último pedido</div><div class="v sm">${fdate(ultimoPedido(id)) || '—'}</div></div><div class="kpi"><div class="l">Compra de</div><div class="s">${reps.map(repTag).join(' ') || '—'}</div></div></div></div>
      <div class="row wrap gap4" style="margin:14px 0"><button class="btn pri sm" onclick="novoPedido({clienteId:'${id}'})">+ Pedido</button><button class="btn sm" onclick="novaAtividade({clienteId:'${id}'})">+ Atividade</button>
        <button class="btn sm" onclick="editar('oportunidades',null,{clienteId:'${id}',etapa:'Prospecção',probabilidade:10,previsao:addDays(hoje(),30)})">+ Oportunidade</button></div>
      ${ops.filter(o => !['Ganha', 'Perdida'].includes(o.etapa)).map(o => `<div class="list-item"><span>🎯 <a class="lnk" onclick="editar('oportunidades','${o.id}')">${esc(o.titulo)}</a> <span class="badge">${o.etapa}</span></span><b>${brl(o.valor)}</b></div>`).join('')}
      <h3 style="margin-top:14px">Histórico</h3>${tl.map(x => x.html).join('') || '<p class="muted">Sem interações registradas.</p>'}`, true);
    state.modalRefresh = desenhar;
  };
  desenhar();
}

/* ---------- Pedidos ---------- */
const STATUS_BADGE = { 'Orçamento': 'b-mut', 'Enviado': 'b-warn', 'Faturado': 'b-ok', 'Entregue': 'b-ok', 'Cancelado': 'b-bad' };
VIEWS.pedidos = () => {
  const s = state; s.st = s.st ?? ''; s.rep = s.rep ?? ''; s.q = s.q ?? ''; s.de = s.de ?? addDays(hoje(), -90); s.ate = s.ate ?? '';
  setActions(`<button class="btn" onclick="exportarPedidos()">⬇ CSV</button><button class="btn pri" onclick="novoPedido()">+ Pedido</button>`);
  const q = s.q.toLowerCase();
  const l = filtrarPedidos().filter(p => !q || [p.numero, nomeCli(p.clienteId), p.pedidoFabrica, p.nf].join(' ').toLowerCase().includes(q));
  const tot = l.filter(p => p.status !== 'Cancelado').reduce((a, p) => { const t = R.totais(p); a.v += t.mercadoria; a.c += R.faturado(p) ? R.comissaoFaturada(p) : t.comissao; return a; }, { v: 0, c: 0 });
  $('#view').innerHTML = `<div class="filters"><input placeholder="🔍 Nº, cliente, pedido na fábrica, NF" value="${esc(s.q)}" onchange="state.q=this.value;render()">
    <select onchange="state.st=this.value;render()"><option value="">Todos os status</option>${R.STATUS.map(x => `<option ${x === s.st ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <select onchange="state.rep=this.value;render()"><option value="">Todas as representadas</option>${db.representadas.map(r => `<option value="${r.id}" ${r.id === s.rep ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select>
    <input type="date" value="${s.de}" onchange="state.de=this.value;render()" title="De"><input type="date" value="${s.ate}" onchange="state.ate=this.value;render()" title="Até"></div>
    <p class="hint">${l.length} pedido(s) · mercadoria ${brl(tot.v)} · comissão ${brl(tot.c)} (sem cancelados)</p>
  ${tabela(['Nº', 'Data', 'Cliente', 'Representada', 'Status', 'Valor (s/ IPI)', 'Comissão', 'Ped. fábrica / NF'], l.map(p => { const t = R.totais(p);
    return `<tr class="clic" onclick="verPedido('${p.id}')"><td><b>#${p.numero}</b></td><td>${fdate(p.data)}</td><td>${esc(nomeCli(p.clienteId))}</td><td>${repTag(p.representadaId)}</td>
      <td><span class="badge ${STATUS_BADGE[p.status]}">${p.status}</span></td><td class="num">${brl(R.faturado(p) ? R.valorVenda(p) : t.mercadoria)}</td><td class="num">${brl(R.faturado(p) ? R.comissaoFaturada(p) : t.comissao)}</td>
      <td>${esc(p.pedidoFabrica || '')}${p.nf ? ' / NF ' + esc(p.nf) : ''}</td></tr>`; }), 'Nenhum pedido no filtro.')}`;
};
function filtrarPedidos() {
  const s = state;
  return db.pedidos.filter(p => (!s.st || p.status === s.st) && (!s.rep || p.representadaId === s.rep) && (!s.de || p.data >= s.de) && (!s.ate || p.data <= s.ate)).sort((a, b) => b.numero - a.numero);
}
function exportarPedidos() {
  csv('pedidos.csv', ['Nº', 'Data', 'Cliente', 'CNPJ', 'Representada', 'Status', 'Mercadoria', 'IPI', 'Total', 'Valor faturado', 'Comissão', 'Data faturamento', 'Pedido fábrica', 'NF', 'Condição'],
    filtrarPedidos().map(p => { const t = R.totais(p), c = byId('clientes', p.clienteId) || {};
      return [p.numero, fdate(p.data), c.razao, c.cnpj, nomeRep(p.representadaId), p.status, t.mercadoria, t.ipi, t.total, R.faturado(p) ? R.valorVenda(p) : '', R.faturado(p) ? R.comissaoFaturada(p) : t.comissao, fdate(p.dataFaturamento), p.pedidoFabrica, p.nf, p.condicao]; }));
}
let rasc = null; // pedido em edição
function novoPedido(padrao = {}) {
  const rep = byId('representadas', padrao.representadaId) || (db.representadas.filter(r => r.ativo !== 'Não').length === 1 ? db.representadas.find(r => r.ativo !== 'Não') : null);
  if (!db.representadas.length) { alert('Cadastre primeiro uma representada (menu Cadastros → Representadas).'); return go('representadas'); }
  rasc = { clienteId: padrao.clienteId || '', representadaId: rep ? rep.id : '', oportunidadeId: padrao.oportunidadeId || '', data: hoje(), status: 'Orçamento', condicao: rep ? rep.condicoes : '', prazoEntrega: '', transportadora: '', obs: '', descontoGeral: 0, itens: [] };
  formPedido();
}
function editarPedido(id) {
  const p = byId('pedidos', id);
  if ((p.comissoes || []).some(c => c.recebida)) return alert('Este pedido já tem comissão recebida e não pode mais ser alterado. Estorne o recebimento em Comissões antes.');
  rasc = JSON.parse(JSON.stringify(p)); formPedido();
}
function formPedido() {
  const p = rasc, rep = byId('representadas', p.representadaId), t = R.totais(p);
  const prods = db.produtos.filter(x => x.representadaId === p.representadaId && x.ativo !== 'Não');
  state.modalRefresh = null;
  openModal(`<h2>${p.id ? 'Pedido #' + p.numero : 'Novo pedido'}</h2>
    <div class="form">
      <div class="full"><label>Cliente *</label><select id="pCli" onchange="rasc.clienteId=this.value"><option value="">Selecione...</option>${db.clientes.filter(c => c.status !== 'Inativo' || c.id === p.clienteId).sort((a, b) => cliLab(a).localeCompare(cliLab(b))).map(c => `<option value="${c.id}" ${c.id === p.clienteId ? 'selected' : ''}>${esc(cliLab(c))}</option>`).join('')}</select></div>
      <div><label>Representada *</label><select onchange="trocarRep(this.value)"><option value="">Selecione...</option>${db.representadas.filter(r => r.ativo !== 'Não' || r.id === p.representadaId).map(r => `<option value="${r.id}" ${r.id === p.representadaId ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></div>
      <div><label>Data</label><input type="date" value="${p.data}" onchange="rasc.data=this.value"></div>
      <div><label>Condição de pagamento</label><input value="${esc(p.condicao)}" placeholder="ex.: 28/42/56" onchange="rasc.condicao=this.value"></div>
      <div><label>Prazo de entrega</label><input value="${esc(p.prazoEntrega)}" onchange="rasc.prazoEntrega=this.value"></div>
      <div><label>Transportadora</label><input value="${esc(p.transportadora)}" onchange="rasc.transportadora=this.value"></div>
      ${p.id ? '' : `<div><label>Salvar como</label><select onchange="rasc.status=this.value"><option ${p.status === 'Orçamento' ? 'selected' : ''}>Orçamento</option><option ${p.status === 'Enviado' ? 'selected' : ''} value="Enviado">Pedido enviado à representada</option></select></div>`}
    </div>
    ${p.representadaId ? `<div style="margin-top:14px"><label>Adicionar produto ${prods.length ? '' : '(nenhum produto cadastrado — digite a descrição abaixo)'}</label>
      <input id="pBusca" list="pLista" placeholder="Código ou descrição e Enter" onkeydown="if(event.key==='Enter'){event.preventDefault();addItem(this.value)}" onchange="addItem(this.value)">
      <datalist id="pLista">${prods.map(x => `<option value="${esc(x.codigo ? x.codigo + ' · ' + x.descricao : x.descricao)}">${brl(x.preco)}</option>`).join('')}</datalist></div>` : '<p class="hint" style="margin-top:12px">Escolha a representada para incluir os produtos.</p>'}
    <div class="tbl-wrap" style="margin-top:10px"><table class="itens"><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Preço</th><th class="num">Desc %</th><th class="num">IPI %</th><th class="num">Comis. %</th><th class="num">Subtotal</th><th></th></tr></thead>
      <tbody>${p.itens.map((i, k) => `<tr><td><input class="w-desc" value="${esc(i.descricao)}" onchange="rasc.itens[${k}].descricao=this.value"><div class="hint">${esc(i.codigo || '')} ${esc(i.unidade || '')}</div></td>
        ${['qtd', 'preco', 'desc', 'ipi', 'comissao'].map(f => `<td><input class="w-num" type="number" step="any" min="0" value="${i[f]}" onchange="setItem(${k},'${f}',this.value)"></td>`).join('')}
        <td class="num">${brl(R.liqItem(i))}</td><td><button class="btn sm danger" onclick="rasc.itens.splice(${k},1);formPedido()">✕</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nenhum item.</td></tr>'}</tbody></table></div>
    ${p.representadaId ? `<button class="btn sm" style="margin-top:8px" onclick="rasc.itens.push({produtoId:'',codigo:'',descricao:'',unidade:'UN',qtd:1,preco:0,desc:0,ipi:0,comissao:${rep ? rep.comissao : 0}});formPedido()">+ Item avulso</button>` : ''}
    <div class="grid edit-grid" style="margin-top:14px"><div><label>Observações (vão impressas no pedido)</label><textarea rows="3" onchange="rasc.obs=this.value">${esc(p.obs)}</textarea>
      ${rep && rep.pedidoMinimo && t.mercadoria < rep.pedidoMinimo ? `<div class="note warn">⚠ Abaixo do pedido mínimo da ${esc(rep.nome)} (${brl(rep.pedidoMinimo)}).</div>` : ''}</div>
      <div class="totals"><div><span>Desconto geral %</span><input class="w-num" type="number" step="any" min="0" value="${p.descontoGeral || 0}" onchange="rasc.descontoGeral=Number(this.value)||0;formPedido()"></div>
        <div><span>Mercadoria</span><b>${brl(t.mercadoria)}</b></div><div><span>IPI</span><span>${brl(t.ipi)}</span></div><div class="g"><span>Total</span><span>${brl(t.total)}</span></div>
        <div class="ok-line"><span>Sua comissão (${num(t.perc, 2)}%)</span><b>${brl(t.comissao)}</b></div></div></div>
    <div class="actions"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn pri" onclick="salvarPedido()">Salvar pedido</button></div>`, true);
  const b = $('#pBusca'); if (b && !p.itens.length) b.focus();
}
function trocarRep(id) {
  const r = byId('representadas', id);
  if (rasc.itens.some(i => i.produtoId) && !confirm('Os produtos da outra representada serão removidos do pedido. Continuar?')) return formPedido();
  rasc.representadaId = id; rasc.itens = rasc.itens.filter(i => !i.produtoId); rasc.condicao = rasc.condicao || (r ? r.condicoes : ''); formPedido();
}
function addItem(txt) {
  const campoBusca = $('#pBusca'); if (campoBusca) campoBusca.value = ''; // evita o "change" do blur adicionar de novo ao redesenhar
  txt = String(txt || '').trim(); if (!txt) return;
  const prods = db.produtos.filter(x => x.representadaId === rasc.representadaId && x.ativo !== 'Não');
  const low = txt.toLowerCase();
  const p = prods.find(x => (x.codigo ? x.codigo + ' · ' + x.descricao : x.descricao) === txt) || prods.find(x => x.codigo && x.codigo.toLowerCase() === low) || prods.filter(x => x.descricao.toLowerCase().includes(low)).length === 1 && prods.find(x => x.descricao.toLowerCase().includes(low));
  const rep = byId('representadas', rasc.representadaId);
  if (!p) { if (!confirm(`Produto "${txt}" não encontrado no cadastro. Incluir como item avulso?`)) return; rasc.itens.push({ produtoId: '', codigo: '', descricao: txt, unidade: 'UN', qtd: 1, preco: 0, desc: 0, ipi: 0, comissao: rep.comissao }); return formPedido(); }
  const ja = rasc.itens.find(i => i.produtoId === p.id);
  if (ja) ja.qtd += Number(p.embalagem) || 1;
  else rasc.itens.push({ produtoId: p.id, codigo: p.codigo, descricao: p.descricao, unidade: p.unidade, qtd: Number(p.embalagem) || 1, preco: p.preco, desc: 0, ipi: p.ipi || 0, comissao: p.comissao || rep.comissao });
  formPedido(); setTimeout(() => { const ins = document.querySelectorAll('.itens .w-num'); const k = rasc.itens.indexOf(ja || rasc.itens[rasc.itens.length - 1]); if (ins[k * 5]) ins[k * 5].select(); }, 0);
}
function setItem(k, f, v) {
  const i = rasc.itens[k]; i[f] = Number(v) || 0;
  const pr = byId('produtos', i.produtoId);
  if (f === 'qtd' && pr && pr.embalagem > 1 && i.qtd % pr.embalagem) toast(`Atenção: ${pr.descricao} é vendido em múltiplos de ${pr.embalagem}`);
  formPedido();
}
async function salvarPedido() {
  rasc.clienteId = $('#pCli').value;
  const r = await acao(() => api('POST', '/api/pedidos', rasc), 'Pedido salvo');
  if (r) { rasc = null; verPedido(r.id); }
}
function verPedido(id) {
  const desenhar = () => {
    const p = byId('pedidos', id); if (!p) return closeModal();
    const c = byId('clientes', p.clienteId) || {}, r = byId('representadas', p.representadaId) || {}, t = R.totais(p);
    const recebida = (p.comissoes || []).some(x => x.recebida);
    const prox = { 'Orçamento': ['Enviado', '📤 Marcar como enviado'], 'Enviado': ['Faturado', '✅ Registrar faturamento'], 'Faturado': ['Entregue', '📦 Marcar como entregue'] }[p.status];
    const msg = `Olá ${c.contato || ''}! Segue o resumo do pedido #${p.numero} (${r.nome}):\n` + p.itens.map(i => `• ${i.qtd} ${i.unidade} ${i.descricao} — ${brl(i.preco)}`).join('\n') + `\nTotal: ${brl(t.total)}${p.condicao ? '\nPagamento: ' + p.condicao : ''}`;
    openModal(`<div class="row wrap no-print" style="justify-content:space-between;margin-bottom:10px"><h2 style="margin:0">Pedido #${p.numero} <span class="badge ${STATUS_BADGE[p.status]}">${p.status}</span></h2><button class="btn sm" onclick="closeModal()">✕</button></div>
      <div class="row wrap gap4 no-print" style="margin-bottom:14px">
        ${prox ? `<button class="btn pri sm" onclick="mudarStatus('${id}','${prox[0]}')">${prox[1]}</button>` : ''}
        ${!recebida ? `<button class="btn sm" onclick="editarPedido('${id}')">✏️ Editar</button>` : ''}
        <button class="btn sm" onclick="window.print()">🖨 Imprimir / PDF</button>
        ${c.whatsapp ? `<a class="btn sm" target="_blank" rel="noopener" href="${zap(c.whatsapp, msg)}">💬 Enviar ao cliente</a>` : ''}
        ${r.email ? `<a class="btn sm" href="mailto:${esc(r.email)}?subject=${encodeURIComponent(`Pedido #${p.numero} — ${c.razao || ''}`)}&body=${encodeURIComponent(msg.replace(/^Olá[^\n]*\n/, 'Segue pedido:\n') + '\n\nCliente: ' + (c.razao || '') + ' — CNPJ ' + (c.cnpj || ''))}">✉️ E-mail p/ representada</a>` : ''}
        <button class="btn sm" onclick="duplicarPedido('${id}')">⧉ Repetir pedido</button>
        ${p.status === 'Faturado' && !recebida ? `<button class="btn sm" onclick="mudarStatus('${id}','Faturado',true)">Ajustar faturamento</button>` : ''}
        ${p.status !== 'Cancelado' && !recebida ? `<button class="btn sm danger" onclick="mudarStatus('${id}','Cancelado')">Cancelar</button>` : ''}
        ${['Orçamento', 'Cancelado'].includes(p.status) ? `<button class="btn sm danger" onclick="excluirPedido('${id}')">Excluir</button>` : ''}
        ${p.status === 'Cancelado' ? `<button class="btn sm" onclick="mudarStatus('${id}','Orçamento')">Reabrir como orçamento</button>` : ''}
      </div>
      <div class="print-doc">
        <div class="row wrap" style="justify-content:space-between;align-items:flex-start;gap:16px"><div><b style="font-size:16px">${esc(db.config.empresa || db.config.nome)}</b><div class="hint">${esc(db.config.nome)}${db.config.core ? ' · ' + esc(db.config.core) : ''}<br>${esc(db.config.telefone)} ${esc(db.config.email)}</div></div>
          <div style="text-align:right"><b>${p.status === 'Orçamento' ? 'ORÇAMENTO' : 'PEDIDO'} Nº ${p.numero}</b><div class="hint">Data: ${fdate(p.data)}${p.pedidoFabrica ? '<br>Pedido na fábrica: ' + esc(p.pedidoFabrica) : ''}${p.nf ? '<br>NF: ' + esc(p.nf) : ''}</div></div></div>
        <div class="grid half" style="margin:14px 0"><div class="box"><div class="hint">REPRESENTADA</div><b>${esc(r.razao || r.nome)}</b><div class="hint">${esc(r.cnpj || '')}</div></div>
          <div class="box"><div class="hint">CLIENTE</div><b>${esc(c.razao)}</b><div class="hint">${c.cnpj ? 'CNPJ ' + esc(c.cnpj) : ''} ${c.ie ? '· IE ' + esc(c.ie) : ''}<br>${esc([c.logradouro, c.numero, c.bairro, c.cidade, c.uf, c.cep].filter(Boolean).join(', '))}<br>${esc(c.contato || '')} ${esc(c.telefone || '')} ${esc(c.email || '')}</div></div></div>
        ${tabela(['Código', 'Descrição', 'Qtd', 'Preço', '% Desc', 'IPI', 'Total'], p.itens.map(i => `<tr><td>${esc(i.codigo)}</td><td style="white-space:normal">${esc(i.descricao)}</td><td class="num">${num(i.qtd, 0)} ${esc(i.unidade)}</td><td class="num">${brl(i.preco)}</td><td class="num">${i.desc ? num(i.desc, 2) : ''}</td><td class="num">${i.ipi ? num(i.ipi, 2) + '%' : ''}</td><td class="num">${brl(R.liqItem(i))}</td></tr>`))}
        <div class="grid edit-grid" style="margin-top:12px"><div class="hint">${p.condicao ? '<b>Pagamento:</b> ' + esc(p.condicao) + '<br>' : ''}${p.prazoEntrega ? '<b>Entrega:</b> ' + esc(p.prazoEntrega) + '<br>' : ''}${p.transportadora ? '<b>Transportadora:</b> ' + esc(p.transportadora) + '<br>' : ''}${p.obs ? '<b>Obs.:</b> ' + esc(p.obs) : ''}${db.config.rodape ? '<p>' + esc(db.config.rodape) + '</p>' : ''}</div>
          <div class="totals">${p.descontoGeral ? `<div><span>Desconto geral</span><span>${num(p.descontoGeral, 2)}%</span></div>` : ''}<div><span>Mercadoria</span><span>${brl(t.mercadoria)}</span></div><div><span>IPI</span><span>${brl(t.ipi)}</span></div><div class="g"><span>Total</span><span>${brl(t.total)}</span></div></div></div>
        <div class="assin">_______________________________<br>${esc(c.contato || c.razao)} — de acordo</div>
      </div>
      <div class="no-print" style="margin-top:16px">
        <div class="card" style="background:var(--panel2)"><h3>Comissão${R.faturado(p) ? '' : ' (prevista)'}: ${brl(R.faturado(p) ? R.comissaoFaturada(p) : t.comissao)} <span class="hint">· ${r.baseComissao === 'Pagamento' ? 'paga conforme o cliente paga' : 'paga sobre o faturamento'}, ${r.diasComissao || 0} dias depois</span></h3>
          ${R.faturado(p) ? `<div class="hint" style="margin-bottom:8px">Faturado em ${fdate(p.dataFaturamento)} · valor faturado ${brl(R.valorVenda(p))}${p.valorFaturado ? ' (informado)' : ''}</div>` : ''}
          ${(p.comissoes || []).map(x => `<div class="list-item"><span>Parcela ${x.n} · vence ${fdate(x.venc)}</span><span>${brl(x.valor)} <span class="badge ${{ Recebida: 'b-ok', Atrasada: 'b-bad', 'A receber': 'b-warn' }[R.situacaoParcela(x)]}">${R.situacaoParcela(x)}${x.recebida ? ' ' + fdate(x.recebidaEm) : ''}</span></span></div>`).join('') || '<p class="hint">As parcelas são geradas quando o pedido é faturado.</p>'}</div>
        <h3 style="margin-top:14px">Histórico</h3>${(p.historico || []).slice().reverse().map(h => `<div class="hint">${new Date(h.em).toLocaleString('pt-BR')} · ${esc(h.por)} · ${esc(h.txt)}</div>`).join('')}
      </div>`, true);
    state.modalRefresh = desenhar;
  };
  desenhar();
}
function mudarStatus(id, status, ajuste) {
  const p = byId('pedidos', id), t = R.totais(p);
  if (status === 'Enviado') {
    openModal(`<h2>Pedido #${p.numero} enviado à ${esc(nomeRep(p.representadaId))}</h2><label>Número do pedido na representada (opcional)</label><input id="sPf" value="${esc(p.pedidoFabrica || '')}">
      <div class="actions"><button class="btn" onclick="verPedido('${id}')">Voltar</button><button class="btn pri" id="sOk">Confirmar</button></div>`);
    $('#sOk').onclick = async () => { if (await acao(() => api('POST', `/api/pedidos/${id}/status`, { status, pedidoFabrica: $('#sPf').value }), 'Pedido enviado')) verPedido(id); };
    return;
  }
  if (status === 'Faturado' && (ajuste || !R.faturado(p))) {
    openModal(`<h2>Faturamento do pedido #${p.numero}</h2><p class="hint">Gera as parcelas de comissão conforme a regra da representada.</p>
      <div class="form"><div><label>Data do faturamento</label><input id="sDf" type="date" value="${p.dataFaturamento || hoje()}"></div><div><label>Nº da NF</label><input id="sNf" value="${esc(p.nf || '')}"></div>
      <div class="full"><label>Valor faturado sem IPI (deixe em branco se foi o pedido inteiro: ${brl(t.mercadoria)})</label><input id="sVf" type="number" step="any" value="${p.valorFaturado || ''}"></div></div>
      <div class="actions"><button class="btn" onclick="verPedido('${id}')">Voltar</button><button class="btn pri" id="sOk">Confirmar faturamento</button></div>`);
    $('#sOk').onclick = async () => { if (await acao(() => api('POST', `/api/pedidos/${id}/status`, { status, dataFaturamento: $('#sDf').value, nf: $('#sNf').value, valorFaturado: $('#sVf').value }), 'Faturamento registrado')) verPedido(id); };
    return;
  }
  if (status === 'Cancelado' && !confirm('Cancelar este pedido?' + (R.faturado(p) ? ' As comissões previstas dele serão removidas.' : ''))) return;
  acao(() => api('POST', `/api/pedidos/${id}/status`, { status }), 'Status: ' + status);
}
async function excluirPedido(id) { if (confirm('Excluir este pedido definitivamente?') && await acao(() => api('DELETE', '/api/pedidos/' + id), 'Pedido excluído')) closeModal(); }
function duplicarPedido(id) {
  const p = byId('pedidos', id);
  rasc = { clienteId: p.clienteId, representadaId: p.representadaId, data: hoje(), status: 'Orçamento', condicao: p.condicao, prazoEntrega: p.prazoEntrega, transportadora: p.transportadora, obs: '', descontoGeral: p.descontoGeral,
    itens: p.itens.map(i => { const pr = byId('produtos', i.produtoId); return { ...i, preco: pr ? pr.preco : i.preco }; }) }; // preço atual da tabela
  formPedido(); toast('Cópia criada com os preços atuais da tabela');
}

/* ---------- Comissões ---------- */
VIEWS.comissoes = () => {
  const s = state; s.sit = s.sit ?? 'abertas'; s.rep = s.rep ?? ''; s.sel = s.sel || new Set();
  const H = hoje();
  let l = R.parcelas(db).filter(c => !s.rep || c.representadaId === s.rep);
  const abertas = l.filter(c => !c.recebida);
  if (s.sit === 'abertas') l = abertas; else if (s.sit === 'atrasadas') l = abertas.filter(c => c.venc < H); else if (s.sit === 'recebidas') l = l.filter(c => c.recebida);
  l.sort((a, b) => s.sit === 'recebidas' ? b.recebidaEm.localeCompare(a.recebidaEm) : a.venc.localeCompare(b.venc));
  const sel = l.filter(c => s.sel.has(c.pedidoId + ':' + c.n));
  const m = mesAtual(), proxM = R.addMeses(m, 1);
  const soma = f => abertas.filter(f).reduce((t, c) => t + c.valor, 0);
  const previstas = db.pedidos.filter(p => p.status === 'Enviado' && (!s.rep || p.representadaId === s.rep)).reduce((t, p) => t + R.totais(p).comissao, 0);
  const recebAno = R.parcelas(db).filter(c => c.recebida && c.recebidaEm.startsWith(H.slice(0, 4)) && (!s.rep || c.representadaId === s.rep)).reduce((t, c) => t + c.valorRecebido, 0);
  setActions(`<button class="btn" onclick="exportarComissoes()">⬇ CSV</button>`);
  $('#view').innerHTML = `<div class="grid kpis">
      <div class="card kpi"><div class="l">Atrasadas</div><div class="v t-bad">${brl(soma(c => c.venc < H))}</div><div class="s">cobrar da representada</div></div>
      <div class="card kpi"><div class="l">Vencem este mês</div><div class="v">${brl(soma(c => c.venc >= H && c.venc.startsWith(m)))}</div></div>
      <div class="card kpi"><div class="l">Próximo mês</div><div class="v">${brl(soma(c => c.venc.startsWith(proxM)))}</div></div>
      <div class="card kpi"><div class="l">Previstas (pedidos não faturados)</div><div class="v">${brl(previstas)}</div><div class="s">recebido em ${H.slice(0, 4)}: ${brl(recebAno)}</div></div></div>
    <div class="filters" style="margin-top:14px"><select onchange="state.sit=this.value;state.sel=new Set();render()">${[['abertas', 'A receber'], ['atrasadas', 'Atrasadas'], ['recebidas', 'Recebidas'], ['todas', 'Todas']].map(([v, t]) => `<option value="${v}" ${v === s.sit ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select onchange="state.rep=this.value;state.sel=new Set();render()"><option value="">Todas as representadas</option>${db.representadas.map(r => `<option value="${r.id}" ${r.id === s.rep ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select>
      ${sel.length ? `<button class="btn pri" onclick="receberSel()">✓ Dar baixa em ${sel.length} (${brl(sel.reduce((t, c) => t + c.valor, 0))})</button>` : '<span class="hint" style="align-self:center">Marque as parcelas que a representada pagou para dar baixa (confira com o extrato de comissões dela).</span>'}</div>
    ${tabela([s.sit !== 'recebidas' ? `<input type="checkbox" onclick="marcarTodas(this.checked)" ${sel.length && sel.length === l.filter(c => !c.recebida).length ? 'checked' : ''}>` : '', 'Vencimento', 'Pedido', 'Cliente', 'Representada', 'Parcela', 'Valor', 'Situação', ''],
      l.map(c => { const k = c.pedidoId + ':' + c.n, sit = R.situacaoParcela(c);
        return `<tr><td>${c.recebida ? '' : `<input type="checkbox" ${s.sel.has(k) ? 'checked' : ''} onclick="state.sel.has('${k}')?state.sel.delete('${k}'):state.sel.add('${k}');render()">`}</td>
          <td>${fdate(c.venc)}</td><td><a class="lnk" onclick="verPedido('${c.pedidoId}')">#${c.numero}</a></td><td>${esc(nomeCli(c.clienteId))}</td><td>${repTag(c.representadaId)}</td><td>${c.n}</td>
          <td class="num">${brl(c.valor)}${c.recebida && c.valorRecebido !== c.valor ? `<div class="hint">recebido ${brl(c.valorRecebido)}</div>` : ''}</td>
          <td><span class="badge ${{ Recebida: 'b-ok', Atrasada: 'b-bad', 'A receber': 'b-warn' }[sit]}">${sit}</span>${c.recebida ? `<div class="hint">${fdate(c.recebidaEm)}</div>` : ''}</td>
          <td>${c.recebida ? `<button class="btn sm" onclick="estornar('${c.pedidoId}',${c.n})">Estornar</button>` : ''}</td></tr>`; }), 'Nenhuma comissão neste filtro. As comissões aparecem quando um pedido é faturado.')}`;
};
function marcarTodas(v) { const s = state; R.parcelas(db).filter(c => !c.recebida && (!s.rep || c.representadaId === s.rep) && (s.sit !== 'atrasadas' || c.venc < hoje())).forEach(c => { const k = c.pedidoId + ':' + c.n; v ? s.sel.add(k) : s.sel.delete(k); }); render(); }
function receberSel() {
  const l = R.parcelas(db).filter(c => state.sel.has(c.pedidoId + ':' + c.n));
  openModal(`<h2>Baixa de ${l.length} comissão(ões)</h2><label>Data do recebimento</label><input id="rData" type="date" value="${hoje()}" style="max-width:200px">
    <p class="hint">Se a representada pagou valor diferente (desconto de devolução, por exemplo), corrija o valor da parcela.</p>
    ${tabela(['Pedido', 'Cliente', 'Parcela', 'Previsto', 'Recebido'], l.map((c, i) => `<tr><td>#${c.numero}</td><td>${esc(nomeCli(c.clienteId))}</td><td>${c.n}</td><td class="num">${brl(c.valor)}</td><td><input class="w-num rv" data-i="${i}" type="number" step="any" value="${c.valor}"></td></tr>`))}
    <div class="actions"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn pri" id="rOk">Confirmar baixa</button></div>`, true);
  $('#rOk').onclick = async () => {
    const vals = [...document.querySelectorAll('.rv')].map(x => x.value);
    const r = await acao(() => api('POST', '/api/comissoes/receber', { data: $('#rData').value, parcelas: l.map((c, i) => ({ pedidoId: c.pedidoId, n: c.n, valor: vals[i] })) }), 'Baixa registrada');
    if (r) { state.sel = new Set(); closeModal(); render(); }
  };
}
function estornar(pedidoId, n) { if (confirm('Estornar o recebimento desta comissão?')) acao(() => api('POST', '/api/comissoes/estornar', { pedidoId, n }), 'Recebimento estornado'); }
function exportarComissoes() {
  csv('comissoes.csv', ['Vencimento', 'Pedido', 'Cliente', 'Representada', 'Parcela', 'Valor', 'Situação', 'Recebida em', 'Valor recebido'],
    R.parcelas(db).sort((a, b) => a.venc.localeCompare(b.venc)).map(c => [fdate(c.venc), c.numero, nomeCli(c.clienteId), nomeRep(c.representadaId), c.n, c.valor, R.situacaoParcela(c), fdate(c.recebidaEm), c.recebida ? c.valorRecebido : '']));
}

/* ---------- Relatórios ---------- */
VIEWS.relatorios = () => {
  const s = state; s.de = s.de ?? R.addMeses(mesAtual(), -11) + '-01'; s.ate = s.ate ?? hoje(); s.rep = s.rep ?? ''; s.tipo = s.tipo || 'rep';
  const vend = vendasValidas().filter(p => (p.dataFaturamento || p.data) >= s.de && (p.dataFaturamento || p.data) <= s.ate && (!s.rep || p.representadaId === s.rep));
  const total = vend.reduce((t, p) => t + R.valorVenda(p), 0), totCom = vend.reduce((t, p) => t + R.comissaoFaturada(p), 0);
  const agrupar = fk => { const m = new Map(); for (const p of vend) { const k = fk(p); const o = m.get(k) || { k, v: 0, c: 0, n: 0 }; o.v += R.valorVenda(p); o.c += R.comissaoFaturada(p); o.n++; m.set(k, o); } return [...m.values()].sort((a, b) => b.v - a.v); };
  let cab, linhas, exp;
  if (s.tipo === 'rep') { const g = agrupar(p => p.representadaId); cab = ['Representada', 'Pedidos', 'Vendido', '% do total', 'Comissão', '% comissão média'];
    linhas = g.map(x => `<tr><td>${repTag(x.k)}</td><td class="num">${x.n}</td><td class="num">${brl(x.v)}</td><td class="num">${num(total ? x.v / total * 100 : 0, 1)}%</td><td class="num">${brl(x.c)}</td><td class="num">${num(x.v ? x.c / x.v * 100 : 0, 2)}%</td></tr>`);
    exp = () => csv('vendas-por-representada.csv', cab, g.map(x => [nomeRep(x.k), x.n, R.r2(x.v), R.r2(total ? x.v / total * 100 : 0), R.r2(x.c)])); }
  else if (s.tipo === 'cli') { const g = agrupar(p => p.clienteId); let ac = 0; cab = ['#', 'Cliente', 'Pedidos', 'Vendido', 'Ticket médio', '% acumulado', 'Curva'];
    const rows = g.map((x, i) => { ac += x.v; const pa = total ? ac / total * 100 : 0; return { ...x, i: i + 1, pa, curva: pa <= 80 ? 'A' : pa <= 95 ? 'B' : 'C' }; });
    linhas = rows.map(x => `<tr><td>${x.i}</td><td><a class="lnk" onclick="fichaCliente('${x.k}')">${esc(nomeCli(x.k))}</a></td><td class="num">${x.n}</td><td class="num">${brl(x.v)}</td><td class="num">${brl(x.v / x.n)}</td><td class="num">${num(x.pa, 1)}%</td><td><span class="badge ${{ A: 'b-ok', B: 'b-warn', C: 'b-mut' }[x.curva]}">${x.curva}</span></td></tr>`);
    exp = () => csv('curva-abc-clientes.csv', cab, rows.map(x => [x.i, nomeCli(x.k), x.n, R.r2(x.v), R.r2(x.v / x.n), R.r2(x.pa), x.curva])); }
  else if (s.tipo === 'mes') { const g = agrupar(p => (p.dataFaturamento || p.data).slice(0, 7)).sort((a, b) => a.k.localeCompare(b.k)); cab = ['Mês', 'Pedidos', 'Vendido', 'Comissão'];
    linhas = g.map(x => `<tr><td>${nomeMes(x.k)}</td><td class="num">${x.n}</td><td class="num">${brl(x.v)}</td><td class="num">${brl(x.c)}</td></tr>`);
    exp = () => csv('vendas-por-mes.csv', cab, g.map(x => [x.k, x.n, R.r2(x.v), R.r2(x.c)])); }
  else if (s.tipo === 'prod') { const m = new Map(); const f = p => 1 - (Number(p.descontoGeral) || 0) / 100;
    for (const p of vend) for (const i of p.itens) { const k = p.representadaId + '|' + (i.codigo || i.descricao); const o = m.get(k) || { rep: p.representadaId, cod: i.codigo, d: i.descricao, q: 0, v: 0 }; o.q += i.qtd; o.v += R.liqItem(i) * f(p); m.set(k, o); }
    const g = [...m.values()].sort((a, b) => b.v - a.v); cab = ['Produto', 'Representada', 'Qtd', 'Valor'];
    linhas = g.map(x => `<tr><td>${esc(x.cod ? x.cod + ' · ' : '')}${esc(x.d)}</td><td>${repTag(x.rep)}</td><td class="num">${num(x.q)}</td><td class="num">${brl(x.v)}</td></tr>`);
    exp = () => csv('vendas-por-produto.csv', cab, g.map(x => [(x.cod ? x.cod + ' ' : '') + x.d, nomeRep(x.rep), x.q, R.r2(x.v)])); }
  else { const fech = db.oportunidades.filter(o => ['Ganha', 'Perdida'].includes(o.etapa) && o.fechadaEm >= s.de && o.fechadaEm <= s.ate && (!s.rep || o.representadaId === s.rep));
    const g = fech.filter(o => o.etapa === 'Ganha'), p = fech.filter(o => o.etapa === 'Perdida');
    const mot = {}; p.forEach(o => { const k = (o.motivoPerda || 'Sem motivo').trim(); mot[k] = (mot[k] || 0) + 1; });
    cab = ['Indicador', 'Valor'];
    linhas = [['Oportunidades ganhas', `${g.length} · ${brl(g.reduce((t, o) => t + o.valor, 0))}`], ['Oportunidades perdidas', `${p.length} · ${brl(p.reduce((t, o) => t + o.valor, 0))}`], ['Taxa de conversão', fech.length ? num(g.length / fech.length * 100, 1) + '%' : '—'],
      ...Object.entries(mot).sort((a, b) => b[1] - a[1]).map(([k, n]) => ['Motivo de perda: ' + k, n + 'x'])].map(([a, b]) => `<tr><td>${esc(a)}</td><td>${b}</td></tr>`);
    exp = () => csv('funil.csv', ['Título', 'Cliente', 'Etapa', 'Valor', 'Fechada em', 'Motivo'], fech.map(o => [o.titulo, nomeCli(o.clienteId), o.etapa, o.valor, fdate(o.fechadaEm), o.motivoPerda])); }
  state.exp = exp;
  setActions(`<button class="btn" onclick="state.exp()">⬇ CSV</button><button class="btn" onclick="window.print()">🖨 Imprimir</button>`);
  $('#view').innerHTML = `<div class="filters"><select onchange="state.tipo=this.value;render()">${[['rep', 'Vendas por representada'], ['cli', 'Curva ABC de clientes'], ['mes', 'Vendas por mês'], ['prod', 'Vendas por produto'], ['funil', 'Funil: conversão e perdas']].map(([v, t]) => `<option value="${v}" ${v === s.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <select onchange="state.rep=this.value;render()"><option value="">Todas as representadas</option>${db.representadas.map(r => `<option value="${r.id}" ${r.id === s.rep ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select>
    <input type="date" value="${s.de}" onchange="state.de=this.value;render()"><input type="date" value="${s.ate}" onchange="state.ate=this.value;render()"></div>
    ${s.tipo !== 'funil' ? `<p class="hint">Pedidos faturados no período (pela data de faturamento): ${vend.length} · vendido ${brl(total)} · comissão ${brl(totCom)}</p>` : ''}
    ${tabela(cab, linhas, 'Sem dados no período.')}`;
};

/* ---------- Representadas ---------- */
VIEWS.representadas = () => {
  setActions(`<button class="btn pri" onclick="editar('representadas',null,{comissao:5,baseComissao:'Faturamento',diasComissao:30,cor:'#2563eb',ativo:'Sim'})">+ Representada</button>`);
  const m = mesAtual(), ano = addDays(hoje(), -365);
  $('#view').innerHTML = `<div class="grid cards3">${db.representadas.map(r => {
    const v12 = vendasValidas().filter(p => p.representadaId === r.id && p.data >= ano).reduce((t, p) => t + R.valorVenda(p), 0), vm = faturadoNoMes(m, r.id);
    const aRec = R.parcelas(db).filter(c => c.representadaId === r.id && !c.recebida).reduce((t, c) => t + c.valor, 0);
    const nprod = db.produtos.filter(p => p.representadaId === r.id).length;
    return `<div class="card rep-card" style="border-top:4px solid ${esc(r.cor || 'var(--pri)')}"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(r.nome)} ${r.ativo === 'Não' ? '<span class="badge b-mut">inativa</span>' : ''}</h3><button class="btn sm" onclick="editar('representadas','${r.id}')">Editar</button></div>
      <div class="hint">${esc(r.segmento || '')}${r.contato ? ' · ' + esc(r.contato) : ''}</div>
      <div class="list-item"><span>Comissão</span><b>${num(r.comissao, 2)}% · ${r.baseComissao === 'Pagamento' ? 'na liquidez' : 'no faturamento'} + ${r.diasComissao || 0}d</b></div>
      <div class="list-item"><span>Mês atual</span><span>${brl(vm)}${r.metaMensal ? ' / ' + brl(r.metaMensal) : ''}</span></div>${r.metaMensal ? barra(vm, r.metaMensal) : ''}
      <div class="list-item"><span>Vendido 12 meses</span><span>${brl(v12)}</span></div><div class="list-item"><span>Comissão a receber</span><span>${brl(aRec)}</span></div>
      <div class="list-item"><span>Produtos</span><a class="lnk" onclick="state={};go('produtos');state.rep='${r.id}';render()">${nprod} cadastrados</a></div>
      <div class="row wrap gap4" style="margin-top:8px">${r.telefone ? `<a class="btn sm" href="tel:${fone(r.telefone)}">📞</a>` : ''}${r.email ? `<a class="btn sm" href="mailto:${esc(r.email)}">✉️</a>` : ''}${r.site ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(/^https?:/.test(r.site) ? r.site : 'https://' + r.site)}">🌐 Portal</a>` : ''}</div></div>`; }).join('') || '<div class="card empty">Cadastre as empresas que você representa: comissão, regra de pagamento e meta.</div>'}</div>`;
};

/* ---------- Produtos ---------- */
VIEWS.produtos = () => {
  const s = state; s.rep = s.rep ?? (db.representadas[0] ? db.representadas[0].id : ''); s.q = s.q ?? '';
  setActions(`<button class="btn" onclick="importarProdutos()">⬆ Importar tabela (CSV)</button><button class="btn pri" onclick="editar('produtos',null,{representadaId:state.rep,unidade:'UN',ativo:'Sim'})">+ Produto</button>`);
  const q = s.q.toLowerCase();
  const l = db.produtos.filter(p => (!s.rep || p.representadaId === s.rep) && (!q || (p.codigo + ' ' + p.descricao + ' ' + p.ean).toLowerCase().includes(q))).sort((a, b) => (a.codigo || a.descricao).localeCompare(b.codigo || b.descricao, 'pt', { numeric: true }));
  const rep = byId('representadas', s.rep);
  $('#view').innerHTML = `<div class="filters"><select onchange="state.rep=this.value;render()"><option value="">Todas as representadas</option>${db.representadas.map(r => `<option value="${r.id}" ${r.id === s.rep ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select>
    <input placeholder="🔍 Código, descrição ou EAN" value="${esc(s.q)}" onchange="state.q=this.value;render()"><span class="hint" style="align-self:center">${l.length} produto(s)</span></div>
    ${tabela(['Código', 'Descrição', 'Representada', 'Un.', 'Preço', 'IPI', 'Comissão', ''], l.slice(0, 1000).map(p => { const r = byId('representadas', p.representadaId);
      return `<tr class="clic ${p.ativo === 'Não' ? 'muted' : ''}" onclick="editar('produtos','${p.id}')"><td>${esc(p.codigo)}</td><td>${esc(p.descricao)}</td><td>${repTag(p.representadaId)}</td><td>${esc(p.unidade)}${p.embalagem > 1 ? ' c/' + p.embalagem : ''}</td>
      <td class="num">${brl(p.preco)}</td><td class="num">${p.ipi ? num(p.ipi, 2) + '%' : ''}</td><td class="num">${num(p.comissao || (r && r.comissao), 2)}%${p.comissao ? '' : '<span class="hint"> padrão</span>'}</td><td>${p.ativo === 'Não' ? 'inativo' : ''}</td></tr>`; }),
      rep ? `Nenhum produto da ${esc(rep.nome)}. Importe a tabela de preços em CSV ou cadastre manualmente.` : 'Nenhum produto.')}
    ${l.length > 1000 ? '<p class="hint">Mostrando os 1.000 primeiros. Use a busca.</p>' : ''}`;
};
const numBR = v => { v = String(v ?? '').trim().replace(/[R$\s%]/g, ''); if (!v) return ''; if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.'); const n = Number(v); return isNaN(n) ? '' : n; };
function lerCSV(txt) {
  const sep = (txt.split('\n')[0].match(/;/g) || []).length >= (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (aspas) { if (ch === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch; }
    else if (ch === '"') aspas = true; else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(c => c.trim()));
}
function importarProdutos() {
  if (!db.representadas.length) return alert('Cadastre a representada primeiro.');
  openModal(`<h2>Importar tabela de preços</h2>
    <p class="hint">Exporte a planilha da representada como <b>CSV</b> (no Excel: Salvar como → CSV). A primeira linha deve ter os títulos das colunas. O sistema reconhece colunas como <i>código, descrição, unidade, preço, IPI, comissão, embalagem, EAN</i>. Produtos com o mesmo código são <b>atualizados</b> (ótimo para reajuste de tabela).</p>
    <div class="form"><div><label>Representada</label><select id="iRep">${db.representadas.map(r => `<option value="${r.id}" ${r.id === state.rep ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></div>
      <div><label>Arquivo CSV</label><input id="iArq" type="file" accept=".csv,.txt,text/csv"></div></div><div id="iPrev" style="margin-top:12px"></div>
    <div class="actions"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn pri" id="iOk" disabled>Importar</button></div>`, true);
  let linhasOk = [];
  $('#iArq').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const buf = await f.arrayBuffer(); let txt = new TextDecoder('utf-8').decode(buf);
    if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf); // planilhas do Excel em português costumam vir em Latin-1
    const ls = lerCSV(txt.replace(/^﻿/, '')); if (ls.length < 2) return $('#iPrev').innerHTML = '<p class="err">Arquivo vazio ou sem linhas de dados.</p>';
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const cab = ls[0].map(norm);
    const acha = (...nomes) => cab.findIndex(c => nomes.some(n => c === n || c.startsWith(n)));
    const ix = { codigo: acha('codigo', 'cod', 'referencia', 'ref', 'sku'), descricao: acha('descricao', 'produto', 'nome', 'desc'), unidade: acha('unidade', 'un', 'und'), preco: acha('preco', 'valor', 'vlr', 'preco unitario'),
      ipi: acha('ipi'), comissao: acha('comissao', '% comissao'), embalagem: acha('embalagem', 'emb', 'multiplo', 'caixa'), ean: acha('ean', 'codigo de barras', 'gtin') };
    if (ix.descricao < 0 || ix.preco < 0) return $('#iPrev').innerHTML = `<p class="err">Não encontrei as colunas de descrição e preço. Colunas lidas: ${esc(ls[0].join(' | '))}</p>`;
    linhasOk = ls.slice(1).map(l => ({ codigo: ix.codigo >= 0 ? l[ix.codigo] : '', descricao: l[ix.descricao], unidade: ix.unidade >= 0 ? l[ix.unidade] : '', preco: numBR(l[ix.preco]), ipi: ix.ipi >= 0 ? numBR(l[ix.ipi]) : '',
      comissao: ix.comissao >= 0 ? numBR(l[ix.comissao]) : '', embalagem: ix.embalagem >= 0 ? numBR(l[ix.embalagem]) : '', ean: ix.ean >= 0 ? l[ix.ean] : '' })).filter(l => (l.descricao || '').trim());
    $('#iPrev').innerHTML = `<p><b>${linhasOk.length}</b> produtos encontrados. Prévia:</p>` + tabela(['Código', 'Descrição', 'Un.', 'Preço', 'IPI', 'Comissão'], linhasOk.slice(0, 8).map(l => `<tr><td>${esc(l.codigo)}</td><td>${esc(l.descricao)}</td><td>${esc(l.unidade)}</td><td class="num">${brl(l.preco)}</td><td class="num">${l.ipi}</td><td class="num">${l.comissao}</td></tr>`));
    $('#iOk').disabled = !linhasOk.length;
  };
  $('#iOk').onclick = async () => {
    const rep = $('#iRep').value;
    const r = await acao(() => api('POST', '/api/produtos/importar', { representadaId: rep, linhas: linhasOk }));
    if (r) { closeModal(); state.rep = rep; render(); toast(`${r.novos} produto(s) novo(s), ${r.atualizados} atualizado(s)`); }
  };
}

/* ---------- Configurações ---------- */
VIEWS.config = () => {
  const c = db.config;
  const campos = [['nome', 'Seu nome'], ['empresa', 'Empresa de representação'], ['cnpj', 'CNPJ'], ['core', 'Registro no CORE'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['cidade', 'Cidade'], ['uf', 'UF'], ['rodape', 'Texto no rodapé dos pedidos', 'textarea', null, 'full']];
  $('#view').innerHTML = `<div class="grid half">
    <div class="card"><h3>Seus dados (saem no pedido impresso)</h3><form id="cfg" class="form">${campos.map(f => campo(f, c)).join('')}</form><div class="actions"><button class="btn pri" onclick="acao(()=>api('PUT','/api/config',Object.fromEntries(new FormData($('#cfg')))),'Dados salvos')">Salvar</button></div></div>
    <div><div class="card"><h3>Minha senha</h3><form id="sen" class="form" onsubmit="event.preventDefault()"><div><label>Senha atual</label><input name="atual" type="password" autocomplete="current-password"></div><div><label>Nova senha</label><input name="nova" type="password" autocomplete="new-password"></div></form>
        <div class="actions"><button class="btn pri" onclick="trocarSenha()">Trocar senha</button></div></div>
      <div class="card" style="margin-top:14px"><h3>Usuários (ex.: assistente)</h3>${db.usuarios.map(u => `<div class="list-item"><span>${esc(u.nome || u.email)} <span class="hint">${esc(u.email)}${u.ativo === 'Não' ? ' · inativo' : ''}</span></span><button class="btn sm" onclick="editar('usuarios','${u.id}')">Editar</button></div>`).join('')}
        <div class="actions"><button class="btn" onclick="editar('usuarios',null,{ativo:'Sim'})">+ Usuário</button></div></div>
      <div class="card" style="margin-top:14px"><h3>Backup</h3><p class="hint">O servidor faz uma cópia automática por dia. Você também pode baixar uma cópia completa aqui.</p>
        <div class="row wrap gap4"><button class="btn" onclick="baixarBackup()">⬇ Baixar backup</button><label class="btn" style="margin:0">⬆ Restaurar<input type="file" accept=".json" hidden onchange="restaurar(this.files[0])"></label></div>
        <h3 style="margin-top:16px">Recomeçar</h3><div class="row wrap gap4"><button class="btn danger" onclick="resetar('vazio')">Apagar tudo e começar do zero</button><button class="btn" onclick="resetar('demo')">Recarregar dados de demonstração</button></div></div></div></div>`;
};
async function trocarSenha() {
  const f = Object.fromEntries(new FormData($('#sen')));
  const r = await acao(() => api('POST', '/api/senha', f), 'Senha alterada'); if (r) setToken(r.token);
}
async function baixarBackup() { const r = await acao(() => api('GET', '/api/backup')); if (r) baixarArquivo(`repcrm-backup-${hoje()}.json`, JSON.stringify(r.backup), 'application/json'); }
async function restaurar(f) {
  if (!f || !confirm('Restaurar este backup? TODOS os dados atuais serão substituídos.')) return;
  let d; try { d = JSON.parse(await f.text()); } catch { return alert('Arquivo inválido'); }
  await acao(() => api('POST', '/api/restore', { backup: d.backup || d }), 'Backup restaurado');
}
function resetar(modo) {
  const p = modo === 'demo' ? 'Substituir TODOS os dados pelos de demonstração?' : 'Apagar TODOS os clientes, pedidos, comissões e cadastros? (Os usuários e seus dados de contato ficam.) Baixe um backup antes.';
  if (!confirm(p) || (modo !== 'demo' && prompt('Digite APAGAR para confirmar') !== 'APAGAR')) return;
  acao(() => api('POST', '/api/reset', { modo }), 'Pronto');
}

/* ================== INÍCIO ================== */
(async () => {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  if (!token) return telaLogin();
  try { await api('GET', '/api/data'); iniciarApp(); } catch (e) { if (e.status !== 401) telaLogin(e.message); }
  setInterval(async () => { if (db && !modalAberto() && document.visibilityState === 'visible') { try { await api('GET', '/api/data'); render(); } catch (e) { } } }, 60e3);
})();
