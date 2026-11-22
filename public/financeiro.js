/* DistribPro — fornecedores, compras, contas a pagar e fluxo de caixa (perfil administrador) */
'use strict';
const nomeForn = id => { const f = byId('fornecedores', id); return f ? (f.fantasia || f.razao) : ''; };
const somaV = a => a.reduce((s, t) => s + t.valor, 0);
const diasAtraso = d => Math.round((new Date(today()) - new Date(d)) / 864e5);
const situacaoPagar = t => t.pago ? `<span class="badge b-ok">Pago ${fdate(t.dataPagamento)}</span>`
  : t.vencimento < today() ? `<span class="badge b-bad">Vencida há ${diasAtraso(t.vencimento)}d</span>`
  : t.vencimento === today() ? '<span class="badge b-warn">Vence hoje</span>' : '<span class="badge">Em aberto</span>';

/* ================== FORNECEDORES ================== */
VIEWS.fornecedores = () => {
  setActions(`<button class="btn" onclick="exportCSV('fornecedores')">Exportar CSV</button><button class="btn pri" onclick="editar('fornecedores')">+ Novo fornecedor</button>`);
  const s = state; const lim = addDays(today(), -365);
  const rows = db.fornecedores.filter(f => match(s.q, f.razao, f.fantasia, f.cnpj, f.categoria, f.cidade)).map(f => {
    const cs = db.compras.filter(c => c.fornecedorId === f.id && c.status !== 'Cancelada');
    return { ...f, ult: cs.map(c => c.data).sort().pop(), total: cs.filter(c => c.data >= lim).reduce((a, c) => a + Regras.totalCompra(c), 0),
      aberto: somaV(db.pagar.filter(t => t.fornecedorId === f.id && !t.pago)), venc: db.pagar.some(t => t.fornecedorId === f.id && !t.pago && t.vencimento < today()), _click: `verFornecedor('${f.id}')` };
  });
  $('#view').innerHTML = `<div class="filters">${filtroTexto('Buscar razão, fantasia, CNPJ, categoria...')}</div>
  ${tabela([['Fornecedor', f => `<b>${esc(f.fantasia || f.razao)}</b><div class="muted" style="font-size:12px">${esc(f.razao)}</div>`], ['CNPJ', f => esc(f.cnpj)], ['Categoria', f => esc(f.categoria)],
    ['Contato', f => `${esc(f.contato)}<div class="muted" style="font-size:12px">${esc(f.telefone)}</div>`], ['Prazo', f => esc(f.prazo || '—')], ['Última compra', f => f.ult ? fdate(f.ult) : '<span class="muted">—</span>'],
    ['Compras 12m', f => brl(f.total), 'num'], ['A pagar', f => `${brl(f.aberto)} ${f.venc ? '<span class="badge b-bad">vencido</span>' : ''}`, 'num'],
    ['Status', f => f.ativo === 'Não' ? '<span class="badge b-mut">Inativo</span>' : '<span class="badge b-ok">Ativo</span>']], rows)}`;
};
function verFornecedor(id) {
  const f = byId('fornecedores', id);
  const cs = db.compras.filter(c => c.fornecedorId === id).sort((a, b) => b.numero - a.numero);
  const ab = db.pagar.filter(t => t.fornecedorId === id && !t.pago).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  openModal(`<h2>${esc(f.fantasia || f.razao)} <span class="muted" style="font-weight:400;font-size:14px">${esc(f.razao)}</span></h2>
   <div class="grid kpis" style="margin-bottom:14px">
    <div class="card kpi"><div class="l">Total comprado</div><div class="v" style="font-size:18px">${brl(cs.filter(c => c.status !== 'Cancelada').reduce((a, c) => a + Regras.totalCompra(c), 0))}</div></div>
    <div class="card kpi"><div class="l">A pagar</div><div class="v" style="font-size:18px">${brl(somaV(ab))}</div><div class="s">${ab.length} conta(s)</div></div>
    <div class="card kpi"><div class="l">Notas lançadas</div><div class="v" style="font-size:18px">${cs.length}</div></div></div>
   <div class="muted" style="margin-bottom:10px">${esc(f.cnpj)} · ${esc(f.contato)} · ${esc(f.telefone)} · ${esc(f.email)} · ${esc(f.cidade)}/${esc(f.uf)}${f.pix ? ' · PIX: ' + esc(f.pix) : ''}</div>
   ${ab.length ? `<h3>Contas em aberto</h3>${tabela([['Vencimento', t => fdate(t.vencimento)], ['Descrição', t => esc(t.descricao) + (t.parcela ? ' <span class="muted">' + t.parcela + '</span>' : '')], ['Valor', t => brl(t.valor), 'num'], ['Situação', situacaoPagar]], ab)}<br>` : ''}
   <h3>Notas de compra</h3>${tabelaCompras(cs.slice(0, 15))}
   <div class="actions"><button class="btn" onclick="editar('fornecedores','${id}')">Editar cadastro</button><button class="btn pri" onclick="novaCompra('${id}')">+ Lançar NF de compra</button></div>`, true);
}

/* ================== CONTAS A PAGAR ================== */
VIEWS.pagar = () => {
  setActions(`<button class="btn" onclick="csvPagar()">Exportar CSV</button><button class="btn pri" onclick="novaConta()">+ Nova conta</button>`);
  const s = state; s.sit = s.sit ?? 'aberto'; const hoje = today();
  const rows = db.pagar.filter(t => {
    const sit = t.pago ? 'pago' : t.vencimento < hoje ? 'vencido' : 'aberto';
    return match(s.q, t.descricao, t.documento, nomeForn(t.fornecedorId)) && (!s.cat || t.categoria === s.cat) && (!s.fo || t.fornecedorId === s.fo)
      && (s.sit === 'todos' || (s.sit === 'aberto' ? !t.pago : sit === s.sit)) && (!s.di || t.vencimento >= s.di) && (!s.df || t.vencimento <= s.df);
  }).sort((a, b) => s.sit === 'pago' ? b.dataPagamento.localeCompare(a.dataPagamento) : a.vencimento.localeCompare(b.vencimento));
  const ab = db.pagar.filter(t => !t.pago), vc = ab.filter(t => t.vencimento < hoje), hj = ab.filter(t => t.vencimento === hoje), sem = ab.filter(t => t.vencimento > hoje && t.vencimento <= addDays(hoje, 7));
  const pagoMes = db.pagar.filter(t => t.pago && (t.dataPagamento || '').startsWith(hoje.slice(0, 7))).reduce((a, t) => a + (t.valorPago || t.valor), 0);
  const cats = Regras.CATEGORIAS_PAGAR;
  $('#view').innerHTML = `<div class="grid kpis" style="margin-bottom:14px">
   <div class="card kpi"><div class="l">Total a pagar</div><div class="v">${brl(somaV(ab))}</div><div class="s">${ab.length} contas</div></div>
   <div class="card kpi"><div class="l">Vencidas</div><div class="v" style="color:var(--bad)">${brl(somaV(vc))}</div><div class="s">${vc.length} contas</div></div>
   <div class="card kpi"><div class="l">Vencem hoje</div><div class="v" style="color:var(--warn)">${brl(somaV(hj))}</div><div class="s">${hj.length} contas</div></div>
   <div class="card kpi"><div class="l">Próximos 7 dias</div><div class="v">${brl(somaV(sem))}</div><div class="s">${sem.length} contas</div></div>
   <div class="card kpi"><div class="l">Pago no mês</div><div class="v" style="color:var(--ok)">${brl(pagoMes)}</div></div></div>
  <div class="filters">${[['aberto', 'Em aberto'], ['vencido', 'Vencidas'], ['pago', 'Pagas'], ['todos', 'Todas']].map(([k, l]) => `<button class="btn ${s.sit === k ? 'pri' : ''}" onclick="state.sit='${k}';render()">${l}</button>`).join('')}</div>
  <div class="filters">${filtroTexto('Buscar descrição, documento, fornecedor...')}
   <select onchange="state.cat=this.value;render()"><option value="">Todas categorias</option>${cats.map(c => `<option ${s.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
   <select onchange="state.fo=this.value;render()"><option value="">Todos fornecedores</option>${db.fornecedores.map(f => `<option value="${f.id}" ${s.fo === f.id ? 'selected' : ''}>${esc(f.fantasia || f.razao)}</option>`).join('')}</select>
   <input type="date" value="${s.di || ''}" onchange="state.di=this.value;render()" title="Vencimento de"><input type="date" value="${s.df || ''}" onchange="state.df=this.value;render()" title="Vencimento até">
   <span class="muted" style="align-self:center">${rows.length} conta(s) · ${brl(somaV(rows))}</span></div>
  ${tabela([['Vencimento', t => fdate(t.vencimento)], ['Descrição', t => `<b>${esc(t.descricao)}</b>${t.parcela ? ' <span class="muted">' + t.parcela + '</span>' : ''}${t.documento ? `<div class="muted" style="font-size:12px">Doc. ${esc(t.documento)}</div>` : ''}`],
    ['Fornecedor', t => esc(nomeForn(t.fornecedorId) || '—')], ['Categoria', t => `<span class="muted">${esc(t.categoria)}</span>`], ['Valor', t => brl(t.valor) + (t.pago && t.valorPago && t.valorPago !== t.valor ? `<div class="muted" style="font-size:12px">pago ${brl(t.valorPago)}</div>` : ''), 'num'],
    ['Situação', situacaoPagar],
    ['', t => `<span class="row" style="justify-content:flex-end">${t.pago ? `<button class="btn sm" onclick="event.stopPropagation();estornarConta('${t.id}')">Estornar</button>`
      : `<button class="btn sm ok" onclick="event.stopPropagation();pagarConta('${t.id}')">Pagar</button>`}</span>`]],
    rows.map(t => ({ ...t, _click: `verConta('${t.id}')` })), 'Nenhuma conta')}`;
};
function novaConta(dados = {}) {
  const cats = Regras.CATEGORIAS_PAGAR;
  openModal(`<h2>Nova conta a pagar</h2><form id="fcp" class="form" onsubmit="event.preventDefault()">
    <div class="full"><label>Descrição *</label><input name="descricao" value="${esc(dados.descricao || '')}" placeholder="Ex.: Aluguel do galpão, Conta de luz, Manutenção do caminhão" required></div>
    <div><label>Fornecedor / favorecido</label><select name="fornecedorId"><option value="">— nenhum —</option>${db.fornecedores.filter(f => f.ativo !== 'Não').map(f => `<option value="${f.id}" ${dados.fornecedorId === f.id ? 'selected' : ''}>${esc(f.fantasia || f.razao)}</option>`).join('')}</select></div>
    <div><label>Categoria</label><select name="categoria">${cats.map(c => `<option ${c === (dados.categoria || 'Outras despesas') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div><label>Nº documento (boleto, NF...)</label><input name="documento"></div>
    <div><label>Emissão</label><input name="emissao" type="date" value="${today()}"></div>
    <div><label>Valor (R$) *</label><input name="valor" type="number" step="0.01" min="0" required></div>
    <div><label>1º vencimento *</label><input name="vencimento" type="date" value="${today()}" required></div>
    <div><label>Lançamento</label><select name="modo" onchange="$('#parc').style.display=this.value==='unica'?'none':''">
      <option value="unica">Conta única</option><option value="parcelar">Parcelar o valor</option><option value="repetir">Repetir todo mês (despesa fixa)</option></select></div>
    <div id="parc" style="display:none"><label>Nº de parcelas / meses</label><input name="parcelas" type="number" min="1" max="120" value="3"></div>
    <div class="full"><label>Observações</label><input name="obs"></div></form>
    <p class="hint">“Parcelar” divide o valor total entre as parcelas. “Repetir” lança o mesmo valor em cada mês (aluguel, salários, internet...).</p>
    <div class="actions"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn pri" onclick="salvarConta()">Salvar</button></div>`);
}
async function salvarConta(id) {
  const b = Object.fromEntries(new FormData($('#fcp')));
  if (id) b.id = id; else if (b.modo === 'unica') b.parcelas = 1;
  if (await acao(() => api('PUT', '/api/pagar', b), 'Conta salva')) closeModal();
}
function verConta(id) {
  const t = db.pagar.find(x => x.id === id); if (!t) return;
  const compra = t.compraId && byId('compras', t.compraId);
  const ro = t.pago;
  openModal(`<h2>${esc(t.descricao)} ${t.parcela ? '<span class="muted" style="font-weight:400">' + t.parcela + '</span>' : ''} ${situacaoPagar(t)}</h2>
    ${compra ? `<p class="hint">Gerada pela <a style="cursor:pointer" onclick="verCompra('${compra.id}')">entrada de NF ${esc(compra.nf || '#' + compra.numero)}</a>.</p>` : ''}
    <form id="fcp" class="form ${ro ? 'ro' : ''}" onsubmit="event.preventDefault()">
    <div class="full"><label>Descrição</label><input name="descricao" value="${esc(t.descricao)}" ${ro ? 'readonly' : ''}></div>
    <div><label>Fornecedor / favorecido</label><select name="fornecedorId" ${ro ? 'disabled' : ''}><option value="">— nenhum —</option>${db.fornecedores.map(f => `<option value="${f.id}" ${t.fornecedorId === f.id ? 'selected' : ''}>${esc(f.fantasia || f.razao)}</option>`).join('')}</select></div>
    <div><label>Categoria</label><select name="categoria" ${ro ? 'disabled' : ''}>${Regras.CATEGORIAS_PAGAR.map(c => `<option ${c === t.categoria ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div><label>Nº documento</label><input name="documento" value="${esc(t.documento)}" ${ro ? 'readonly' : ''}></div>
    <div><label>Emissão</label><input name="emissao" type="date" value="${t.emissao || ''}" ${ro ? 'readonly' : ''}></div>
    <div><label>Valor (R$)</label><input name="valor" type="number" step="0.01" value="${t.valor}" ${ro ? 'readonly' : ''}></div>
    <div><label>Vencimento</label><input name="vencimento" type="date" value="${t.vencimento}" ${ro ? 'readonly' : ''}></div>
    <div class="full"><label>Observações</label><input name="obs" value="${esc(t.obs)}" ${ro ? 'readonly' : ''}></div></form>
    ${t.pago ? `<div class="nfe">Pago em ${fdate(t.dataPagamento)} — ${brl(t.valorPago || t.valor)}${t.formaPagamento ? ' via ' + esc(t.formaPagamento) : ''}${t.baixadoPor ? ' · baixa por ' + esc(t.baixadoPor) : ''}</div>` : ''}
    <div class="actions">${!t.pago ? `<button class="btn danger" onclick="excluirConta('${id}')">Excluir</button>` : ''}<span style="flex:1"></span>
      <button class="btn" onclick="closeModal()">Fechar</button>
      ${t.pago ? `<button class="btn" onclick="estornarConta('${id}')">Estornar pagamento</button>` : `<button class="btn" onclick="salvarConta('${id}')">Salvar alterações</button><button class="btn pri" onclick="pagarConta('${id}')">Pagar</button>`}</div>`);
}
function pagarConta(id) {
  const t = db.pagar.find(x => x.id === id);
  openModal(`<h2>Registrar pagamento</h2><p><b>${esc(t.descricao)}</b> ${t.parcela || ''}<br><span class="muted">${esc(nomeForn(t.fornecedorId))} · vencimento ${fdate(t.vencimento)} · ${brl(t.valor)}</span></p>
    <div class="form"><div><label>Data do pagamento</label><input id="pgD" type="date" value="${today()}"></div>
    <div><label>Valor pago (com juros/desconto)</label><input id="pgV" type="number" step="0.01" value="${t.valor}"></div>
    <div class="full"><label>Forma de pagamento</label><select id="pgF">${['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão', 'Débito automático', 'Cheque'].map(f => `<option>${f}</option>`).join('')}</select></div></div>
    <div class="actions"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn pri" onclick="confirmarPagamento('${id}')">Confirmar pagamento</button></div>`);
}
async function confirmarPagamento(id) {
  if (await acao(() => api('POST', `/api/pagar/${id}/baixa`, { pago: true, data: $('#pgD').value, valorPago: +$('#pgV').value, forma: $('#pgF').value }), 'Pagamento registrado')) closeModal();
}
async function estornarConta(id) {
  if (!confirm('Estornar este pagamento? A conta volta a ficar em aberto.')) return;
  if (await acao(() => api('POST', `/api/pagar/${id}/baixa`, { pago: false }), 'Pagamento estornado')) closeModal();
}
async function excluirConta(id) {
  if (!confirm('Excluir esta conta a pagar?')) return;
  if (await acao(() => api('DELETE', '/api/pagar/' + id), 'Conta excluída')) closeModal();
}
function csvPagar() {
  const head = ['Vencimento', 'Descrição', 'Parcela', 'Fornecedor', 'Categoria', 'Documento', 'Valor', 'Pago', 'Data pagamento', 'Valor pago'];
  const lines = db.pagar.map(t => [t.vencimento, t.descricao, t.parcela, nomeForn(t.fornecedorId), t.categoria, t.documento, String(t.valor).replace('.', ','), t.pago ? 'Sim' : 'Não', t.dataPagamento, String(t.valorPago || '').replace('.', ',')]
    .map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';'));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv' })); a.download = 'contas-a-pagar.csv'; a.click();
}

/* ================== COMPRAS (NF DE ENTRADA) ================== */
function tabelaCompras(rows) {
  return tabela([['Nº', c => `<b>#${c.numero}</b>`], ['Data', c => fdate(c.data)], ['NF', c => esc(c.nf || '—')], ['Fornecedor', c => esc(nomeForn(c.fornecedorId))], ['Itens', c => c.itens.length, 'num'],
    ['Total', c => brl(Regras.totalCompra(c)), 'num'], ['Prazo', c => esc(c.parcelas) + ' dias'], ['Status', c => c.status === 'Cancelada' ? '<span class="badge b-bad">Cancelada</span>' : '<span class="badge b-ok">Lançada</span>']],
    rows.map(c => ({ ...c, _click: `verCompra('${c.id}')` })), 'Nenhuma nota lançada');
}
VIEWS.compras = () => {
  setActions(`<button class="btn pri" onclick="novaCompra()">+ Lançar NF de compra</button>`);
  const s = state; const mes = today().slice(0, 7);
  const rows = [...db.compras].sort((a, b) => b.numero - a.numero).filter(c => match(s.q, c.nf, c.numero, nomeForn(c.fornecedorId)) && (!s.fo || c.fornecedorId === s.fo));
  const val = db.compras.filter(c => c.status !== 'Cancelada');
  const sugestao = db.produtos.filter(p => p.ativo !== 'Não' && p.estoque <= p.estoqueMin);
  $('#view').innerHTML = `<div class="grid kpis" style="margin-bottom:14px">
   <div class="card kpi"><div class="l">Compras no mês</div><div class="v">${brl(val.filter(c => c.data.startsWith(mes)).reduce((a, c) => a + Regras.totalCompra(c), 0))}</div><div class="s">${val.filter(c => c.data.startsWith(mes)).length} nota(s)</div></div>
   <div class="card kpi"><div class="l">Compras 90 dias</div><div class="v">${brl(val.filter(c => c.data >= addDays(today(), -90)).reduce((a, c) => a + Regras.totalCompra(c), 0))}</div></div>
   <div class="card kpi" style="cursor:pointer" onclick="sugerirCompra()"><div class="l">Produtos para repor</div><div class="v" style="color:${sugestao.length ? 'var(--bad)' : ''}">${sugestao.length}</div><div class="s">abaixo do estoque mínimo — clique para ver</div></div></div>
  <div class="filters">${filtroTexto('Buscar NF, fornecedor...')}<select onchange="state.fo=this.value;render()"><option value="">Todos fornecedores</option>${db.fornecedores.map(f => `<option value="${f.id}" ${s.fo === f.id ? 'selected' : ''}>${esc(f.fantasia || f.razao)}</option>`).join('')}</select></div>
  ${tabelaCompras(rows)}
  <p class="hint">Ao lançar uma NF de compra o sistema dá entrada no estoque, recalcula o custo médio dos produtos (com rateio de frete) e gera as contas a pagar conforme o prazo.</p>`;
};
function sugerirCompra() {
  const lista = db.produtos.filter(p => p.ativo !== 'Não' && p.estoque <= p.estoqueMin);
  openModal(`<h2>Sugestão de reposição</h2><p class="hint">Produtos abaixo do estoque mínimo. Quantidade sugerida = 2× o mínimo − estoque atual.</p>
    ${tabela([['Produto', p => esc(p.nome)], ['Estoque', p => num(p.estoque), 'num'], ['Mínimo', p => num(p.estoqueMin), 'num'], ['Sugerido', p => `<b>${num(Math.max(1, p.estoqueMin * 2 - p.estoque))}</b> ${p.unidade}`, 'num'], ['Último custo', p => brl(p.custo), 'num']], lista, 'Nenhum produto abaixo do mínimo ✅')}
    <div class="actions"><button class="btn" onclick="closeModal()">Fechar</button>${lista.length ? `<button class="btn pri" onclick="novaCompra('', true)">Lançar NF com estes itens</button>` : ''}</div>`, true);
}
let compraDraft = null;
function novaCompra(fornecedorId = '', comSugestao = false) {
  const f = byId('fornecedores', fornecedorId);
  compraDraft = { fornecedorId, nf: '', data: today(), parcelas: f && f.prazo ? f.prazo : '28', frete: 0, outras: 0, atualizarCusto: true, obs: '',
    itens: comSugestao ? db.produtos.filter(p => p.ativo !== 'Não' && p.estoque <= p.estoqueMin).map(p => ({ produtoId: p.id, qtd: Math.max(1, p.estoqueMin * 2 - p.estoque), custo: p.custo })) : [] };
  editorCompra();
}
function editorCompra() {
  const d = compraDraft;
  const linhas = d.itens.map((i, k) => {
    const p = byId('produtos', i.produtoId) || {};
    return `<tr><td>${esc(p.codigo)}</td><td>${esc(p.nome)}<div class="muted" style="font-size:11px">Estoque ${p.estoque} ${p.unidade} · custo atual ${brl(p.custo)}</div></td>
    <td><input type="number" min="1" style="width:80px" value="${i.qtd}" onchange="compraDraft.itens[${k}].qtd=Math.max(1,+this.value||1);editorCompra()"></td>
    <td><input type="number" step="0.01" style="width:100px" value="${i.custo}" onchange="compraDraft.itens[${k}].custo=+this.value||0;editorCompra()"></td>
    <td class="num">${brl(i.qtd * i.custo)}</td><td><button class="btn sm danger" onclick="compraDraft.itens.splice(${k},1);editorCompra()">✕</button></td></tr>`;
  }).join('');
  const tot = Regras.totalCompra(d); const dias = Regras.diasParcelas(d.parcelas); const vals = Regras.dividir(tot, dias.length);
  openModal(`<h2>Lançar NF de compra</h2>
  <div class="form">
    <div class="full"><label>Fornecedor *</label><select onchange="setFornCompra(this.value)"><option value="">Selecione...</option>${db.fornecedores.filter(f => f.ativo !== 'Não').map(f => `<option value="${f.id}" ${f.id === d.fornecedorId ? 'selected' : ''}>${esc(f.fantasia || f.razao)} — ${esc(f.cnpj)}</option>`).join('')}</select></div>
    <div><label>Nº da NF</label><input value="${esc(d.nf)}" onchange="compraDraft.nf=this.value"></div>
    <div><label>Data de entrada</label><input type="date" value="${d.data}" onchange="compraDraft.data=this.value;editorCompra()"></div>
    <div><label>Prazo de pagamento (dias)</label><input value="${esc(d.parcelas)}" placeholder="ex: 28,42" onchange="compraDraft.parcelas=this.value;editorCompra()"></div>
  </div>
  <h3 style="margin-top:18px">Itens da nota</h3>
  <div class="row" style="margin-bottom:10px"><input list="dlprodc" id="addProdC" placeholder="Código, EAN ou nome do produto + Enter" onkeydown="if(event.key==='Enter'){addItemCompra(this.value)}">
    <datalist id="dlprodc">${db.produtos.map(p => `<option value="${esc(p.codigo)} - ${esc(p.nome)}">`).join('')}</datalist>
    <button class="btn" onclick="addItemCompra($('#addProdC').value)">Adicionar</button></div>
  <div class="tbl-wrap"><table><thead><tr><th>Cód</th><th>Produto</th><th>Qtd</th><th>Custo un. (R$)</th><th class="num">Subtotal</th><th></th></tr></thead><tbody>${linhas || '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">Nenhum item</td></tr>'}</tbody></table></div>
  <div class="grid edit-grid" style="margin-top:14px;align-items:start">
    <div><label><input type="checkbox" style="width:auto" ${d.atualizarCusto ? 'checked' : ''} onchange="compraDraft.atualizarCusto=this.checked"> Atualizar custo dos produtos (custo médio ponderado, com rateio de frete e despesas)</label>
      <label style="margin-top:10px">Observações</label><textarea rows="2" onchange="compraDraft.obs=this.value">${esc(d.obs)}</textarea>
      <label style="margin-top:10px">Contas a pagar que serão geradas</label>${dias.map((dd, k) => `<div class="hint">${k + 1}/${dias.length} — venc. ${fdate(addDays(d.data, dd))} — <b>${brl(vals[k])}</b></div>`).join('')}</div>
    <div class="totals">
      <div><span>Produtos</span><span>${brl(d.itens.reduce((s, i) => s + i.qtd * i.custo, 0))}</span></div>
      <div><span>Frete (R$)</span><input type="number" step="0.01" style="width:100px;padding:4px 6px" value="${d.frete}" onchange="compraDraft.frete=+this.value||0;editorCompra()"></div>
      <div><span>Outras despesas (R$)</span><input type="number" step="0.01" style="width:100px;padding:4px 6px" value="${d.outras}" onchange="compraDraft.outras=+this.value||0;editorCompra()"></div>
      <div class="g"><span>Total da NF</span><span>${brl(tot)}</span></div>
    </div></div>
  <div class="actions"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn pri" onclick="salvarCompra()">Lançar entrada</button></div>`, true);
}
function setFornCompra(id) { compraDraft.fornecedorId = id; const f = byId('fornecedores', id); if (f && f.prazo) compraDraft.parcelas = f.prazo; editorCompra(); }
function addItemCompra(txt) {
  txt = (txt || '').trim(); if (!txt) return; const cod = txt.split(' - ')[0];
  const p = db.produtos.find(x => x.codigo === cod || x.ean === cod) || db.produtos.find(x => x.nome.toLowerCase().includes(txt.toLowerCase()));
  if (!p) return toast('Produto não encontrado');
  const ex = compraDraft.itens.find(i => i.produtoId === p.id); if (ex) ex.qtd++; else compraDraft.itens.push({ produtoId: p.id, qtd: 1, custo: p.custo });
  editorCompra(); setTimeout(() => $('#addProdC') && $('#addProdC').focus(), 0);
}
async function salvarCompra() {
  const d = compraDraft;
  if (!d.fornecedorId) return toast('Selecione o fornecedor'); if (!d.itens.length) return toast('Adicione pelo menos um item');
  const r = await acao(() => api('POST', '/api/compras', d), 'Entrada lançada: estoque e contas a pagar atualizados');
  if (r) { closeModal(); verCompra(r.id); }
}
function verCompra(id) {
  const c = byId('compras', id); if (!c) return; const f = byId('fornecedores', c.fornecedorId) || {};
  const tits = db.pagar.filter(t => t.compraId === id);
  openModal(`<div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>Entrada #${c.numero} — NF ${esc(c.nf || 's/n')} ${c.status === 'Cancelada' ? '<span class="badge b-bad">Cancelada</span>' : '<span class="badge b-ok">Lançada</span>'}</h2></div>
    <p><b>${esc(f.razao)}</b> · ${esc(f.cnpj)}<br><span class="muted">Entrada em ${fdate(c.data)} · lançada por ${esc(c.criadoPor || '—')} · ${c.atualizarCusto ? 'custo médio atualizado' : 'custo não alterado'}</span></p>
    ${tabela([['Cód', i => esc((byId('produtos', i.produtoId) || {}).codigo)], ['Produto', i => esc((byId('produtos', i.produtoId) || {}).nome)], ['Qtd', i => num(i.qtd), 'num'], ['Custo un.', i => brl(i.custo), 'num'], ['Subtotal', i => brl(i.qtd * i.custo), 'num']], c.itens)}
    <div class="grid edit-grid" style="margin-top:12px;align-items:start">
      <div>${c.obs ? `<label>Observações</label><div>${esc(c.obs)}</div>` : ''}<label style="margin-top:8px">Contas a pagar</label>
        ${tits.map(t => `<div>${t.parcela} — venc. ${fdate(t.vencimento)} — ${brl(t.valor)} ${situacaoPagar(t)}</div>`).join('') || '<div class="muted">—</div>'}</div>
      <div class="totals">${c.frete ? `<div><span>Frete</span><span>${brl(c.frete)}</span></div>` : ''}${c.outras ? `<div><span>Outras despesas</span><span>${brl(c.outras)}</span></div>` : ''}<div class="g"><span>Total</span><span>${brl(Regras.totalCompra(c))}</span></div></div></div>
    <div class="actions">${c.status !== 'Cancelada' ? `<button class="btn danger" onclick="cancelarCompra('${id}')">Cancelar entrada</button>` : ''}<span style="flex:1"></span><button class="btn" onclick="window.print()">Imprimir</button><button class="btn pri" onclick="closeModal()">Fechar</button></div>`, true);
}
async function cancelarCompra(id) {
  if (!confirm('Cancelar esta entrada? O estoque será estornado e as contas a pagar ainda não pagas serão removidas. O custo dos produtos não é revertido.')) return;
  if (await acao(() => api('POST', `/api/compras/${id}/cancelar`), 'Entrada cancelada')) verCompra(id);
}

/* ================== FLUXO DE CAIXA ================== */
VIEWS.fluxo = () => {
  const s = state; s.dias = s.dias || 30; s.saldo = s.saldo ?? '';
  const hoje = today(), fim = addDays(hoje, s.dias - 1);
  const rec = db.titulos.filter(t => !t.pago), pag = db.pagar.filter(t => !t.pago);
  const recVenc = somaV(rec.filter(t => t.vencimento < hoje)), pagVenc = somaV(pag.filter(t => t.vencimento < hoje));
  // agrupa por semana (ou dia, se 30 dias ou menos for escolhido no modo diário)
  const porDia = s.modo === 'dia';
  const grupos = [];
  for (let d = hoje; d <= fim;) {
    const ate = porDia ? d : (addDays(d, 6) > fim ? fim : addDays(d, 6));
    grupos.push({ de: d, ate, ent: somaV(rec.filter(t => t.vencimento >= d && t.vencimento <= ate)), sai: somaV(pag.filter(t => t.vencimento >= d && t.vencimento <= ate)) });
    d = addDays(ate, 1);
  }
  let acum = Number(s.saldo) || 0;
  grupos.forEach(g => { g.res = g.ent - g.sai; acum += g.res; g.acum = acum; });
  const totEnt = grupos.reduce((a, g) => a + g.ent, 0), totSai = grupos.reduce((a, g) => a + g.sai, 0);
  // realizado nos últimos 30 dias
  const ini30 = addDays(hoje, -30);
  const recebido = db.titulos.filter(t => t.pago && t.dataPagamento >= ini30).reduce((a, t) => a + t.valor, 0);
  const pago = db.pagar.filter(t => t.pago && t.dataPagamento >= ini30).reduce((a, t) => a + (t.valorPago || t.valor), 0);
  // despesas por categoria (pagas nos últimos 90 dias)
  const cat = {}; db.pagar.filter(t => t.pago && t.dataPagamento >= addDays(hoje, -90)).forEach(t => cat[t.categoria] = (cat[t.categoria] || 0) + (t.valorPago || t.valor));
  const catRows = Object.entries(cat).sort((a, b) => b[1] - a[1]); const catMax = catRows[0] ? catRows[0][1] : 1; const catTot = catRows.reduce((a, r) => a + r[1], 0);
  // gráfico
  const W = 640, H = 200, n = grupos.length, bw = W / Math.max(n, 1); const mx = Math.max(1, ...grupos.map(g => Math.max(g.ent, g.sai)));
  const chart = `<svg viewBox="0 0 ${W} ${H + 24}" width="100%" style="max-height:250px">${grupos.map((g, i) => {
    const he = g.ent / mx * (H - 20), hs = g.sai / mx * (H - 20), x = i * bw, w = Math.max(2, bw * .36);
    return `<rect x="${x + bw * .12}" y="${H - he}" width="${w}" height="${he}" rx="3" fill="var(--ok)"><title>Entradas ${brl(g.ent)}</title></rect>
      <rect x="${x + bw * .12 + w + 2}" y="${H - hs}" width="${w}" height="${hs}" rx="3" fill="var(--bad)"><title>Saídas ${brl(g.sai)}</title></rect>
      ${n <= 16 || i % Math.ceil(n / 16) === 0 ? `<text x="${x + bw / 2}" y="${H + 16}" text-anchor="middle">${fdate(g.de).slice(0, 5)}</text>` : ''}`;
  }).join('')}</svg>`;
  $('#view').innerHTML = `<div class="filters">${[30, 60, 90].map(d => `<button class="btn ${s.dias === d ? 'pri' : ''}" onclick="state.dias=${d};render()">Próximos ${d} dias</button>`).join('')}
    <select onchange="state.modo=this.value;render()"><option value="semana">Por semana</option><option value="dia" ${porDia ? 'selected' : ''}>Por dia</option></select>
    <input type="number" step="0.01" placeholder="Saldo atual em caixa/banco (R$)" value="${esc(s.saldo)}" onchange="state.saldo=this.value;render()" style="min-width:240px"></div>
  <div class="grid kpis" style="margin-bottom:14px">
   <div class="card kpi"><div class="l">Entradas previstas</div><div class="v" style="color:var(--ok)">${brl(totEnt)}</div><div class="s">contas a receber no período</div></div>
   <div class="card kpi"><div class="l">Saídas previstas</div><div class="v" style="color:var(--bad)">${brl(totSai)}</div><div class="s">contas a pagar no período</div></div>
   <div class="card kpi"><div class="l">Resultado do período</div><div class="v" style="color:${totEnt - totSai >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(totEnt - totSai)}</div><div class="s">${s.saldo !== '' ? 'saldo final projetado ' + brl(acum) : 'informe o saldo atual para projetar'}</div></div>
   <div class="card kpi"><div class="l">Atrasados</div><div class="v" style="font-size:18px"><span style="color:var(--ok)">+${brl(recVenc)}</span></div><div class="s" style="color:var(--bad)">−${brl(pagVenc)} a pagar vencido</div></div></div>
  <div class="grid two" style="align-items:start">
   <div class="card"><h3>Entradas × saídas previstas <span class="hint" style="font-weight:400">— <span style="color:var(--ok)">■</span> receber <span style="color:var(--bad)">■</span> pagar</span></h3>${chart}</div>
   <div class="card"><h3>Realizado — últimos 30 dias</h3>
     <div class="list-item"><span>Recebido de clientes</span><b style="color:var(--ok)">${brl(recebido)}</b></div>
     <div class="list-item"><span>Pago a fornecedores e despesas</span><b style="color:var(--bad)">${brl(pago)}</b></div>
     <div class="list-item"><span><b>Geração de caixa</b></span><b style="color:${recebido - pago >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(recebido - pago)}</b></div>
     <h3 style="margin-top:16px">Despesas por categoria (90 dias)</h3>
     ${catRows.map(([c, v]) => `<div style="margin-bottom:8px"><div class="row" style="justify-content:space-between"><span>${esc(c)}</span><span><b>${brl(v)}</b> <span class="muted">${num(v / catTot * 100)}%</span></span></div><div class="bar" style="margin-top:3px"><i style="width:${v / catMax * 100}%;background:var(--bad)"></i></div></div>`).join('') || '<p class="muted">Sem despesas pagas.</p>'}</div>
  </div>
  <div style="margin-top:14px">${tabela([[porDia ? 'Dia' : 'Semana', g => porDia ? fdate(g.de) : `${fdate(g.de)} a ${fdate(g.ate)}`], ['Entradas', g => `<span style="color:var(--ok)">${brl(g.ent)}</span>`, 'num'], ['Saídas', g => `<span style="color:var(--bad)">${brl(g.sai)}</span>`, 'num'],
    ['Resultado', g => `<b style="color:${g.res >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(g.res)}</b>`, 'num'], [s.saldo !== '' ? 'Saldo projetado' : 'Acumulado', g => `<span style="color:${g.acum >= 0 ? 'inherit' : 'var(--bad)'}">${brl(g.acum)}</span>`, 'num']], grupos)}</div>
  <p class="hint">Considera os títulos em aberto de contas a receber e a pagar pela data de vencimento. Valores já vencidos aparecem em “Atrasados” e não entram na projeção.</p>`;
};
