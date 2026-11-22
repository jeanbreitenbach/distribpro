/* DistribPro — contas bancárias, importação de extrato OFX e conciliação (perfil administrador) */
'use strict';
SCHEMAS.bancos = { titulo: 'Conta bancária', fields: [['nome', 'Nome da conta (ex.: Itaú conta corrente)', 'text', 'full'], ['banco', 'Banco'], ['agencia', 'Agência'], ['conta', 'Conta'],
  ['saldoInicial', 'Saldo no fim do dia abaixo (R$)', 'number'], ['dataSaldo', 'Data do saldo', 'date'], ['ativo', 'Ativa', 'select', simNao]] };
const CATEGORIAS_ENTRADA = ['Rendimento de aplicação', 'Transferência entre contas', 'Aporte de sócio', 'Empréstimo / financiamento', 'Estorno / devolução', 'Outras receitas'];

const saldoBanco = b => (Number(b.saldoInicial) || 0) + db.extrato.filter(e => e.bancoId === b.id && (!b.dataSaldo || e.data > b.dataSaldo)).reduce((s, e) => s + e.valor, 0);
const saldoBancos = () => db.bancos.filter(b => b.ativo !== 'Não').reduce((s, b) => s + saldoBanco(b), 0);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/* ---------- Leitura do OFX (1.x SGML e 2.x XML) ---------- */
function decodificarOFX(buf) {
  const cabecalho = new TextDecoder('ascii').decode(buf.slice(0, 600));
  const latin = /CHARSET:\s*(1252|8859|ISO-8859-1)/i.test(cabecalho) || /encoding="(windows-1252|iso-8859-1)"/i.test(cabecalho);
  let t = new TextDecoder(latin ? 'windows-1252' : 'utf-8').decode(buf);
  if (!latin && t.includes('�')) t = new TextDecoder('windows-1252').decode(buf); // arquivo sem cabeçalho de charset, mas em Latin-1
  return t;
}
function lerOFX(texto) {
  if (!/<OFX>/i.test(texto)) throw new Error('O arquivo não parece ser um extrato OFX.');
  const tag = (bloco, nome) => { const m = bloco.match(new RegExp('<' + nome + '>\\s*([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
  const valor = v => { v = String(v).trim(); if (v.includes(',') && v.includes('.')) v = v.replace(/\./g, '').replace(',', '.'); else v = v.replace(',', '.'); return Number(v); };
  const data = v => { const d = String(v).replace(/\D/g, ''); return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : ''; };
  const blocos = texto.split(/<STMTTRN>/i).slice(1).map(b => b.split(/<\/STMTTRN>/i)[0]);
  const lancamentos = blocos.map(b => {
    const memo = tag(b, 'MEMO'), name = tag(b, 'NAME');
    return { data: data(tag(b, 'DTPOSTED')), valor: valor(tag(b, 'TRNAMT')), fitid: tag(b, 'FITID'), documento: tag(b, 'CHECKNUM') || tag(b, 'REFNUM'),
      descricao: [name, memo].filter((x, i, a) => x && a.indexOf(x) === i).join(' - ') || tag(b, 'TRNTYPE') };
  }).filter(l => l.data && l.valor);
  if (!lancamentos.length) throw new Error('Nenhum lançamento encontrado no extrato.');
  const ledger = texto.split(/<LEDGERBAL>/i)[1] || '';
  return { banco: tag(texto, 'BANKID'), agencia: tag(texto, 'BRANCHID'), conta: tag(texto, 'ACCTID'), inicio: data(tag(texto, 'DTSTART')), fim: data(tag(texto, 'DTEND')),
    saldo: ledger ? valor(tag(ledger, 'BALAMT')) : null, saldoData: ledger ? data(tag(ledger, 'DTASOF')) : '', lancamentos };
}
function importarOFX(bancoId) {
  if (!bancoId) return toast('Selecione a conta bancária');
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.ofx,.OFX';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    let x; try { x = lerOFX(decodificarOFX(await f.arrayBuffer())); } catch (e) { return alert('Não foi possível ler o extrato:\n\n' + e.message); }
    const b = byId('bancos', bancoId);
    if (x.conta && b.conta && soDig(x.conta).slice(-5) && !soDig(b.conta).includes(soDig(x.conta).slice(-5)) && !soDig(x.conta).includes(soDig(b.conta).slice(-5))
      && !confirm(`O extrato é da conta ${x.conta}, mas você está importando em "${b.nome}" (conta ${b.conta}). Continuar?`)) return;
    const r = await acao(() => api('POST', '/api/extrato/importar', { bancoId, lancamentos: x.lancamentos }));
    if (!r) return;
    const i = r.importacao;
    let msg = `${i.novos} lançamento(s) importado(s)` + (i.duplicados ? `, ${i.duplicados} já existiam e foram ignorados` : '') + (i.ignorados ? `, ${i.ignorados} inválido(s)` : '') + '.';
    if (x.saldo != null) { const nosso = saldoBanco(byId('bancos', bancoId)); if (Math.abs(nosso - x.saldo) > 0.05) msg += `\n\nAtenção: o saldo informado pelo banco em ${fdate(x.saldoData)} é ${brl(x.saldo)} e o saldo calculado no sistema é ${brl(nosso)}. Confira o saldo inicial da conta.`; else msg += `\n\nSaldo conferido com o banco: ${brl(x.saldo)} ✓`; }
    alert(msg);
  };
  inp.click();
}

/* ---------- Sugestões de conciliação ---------- */
function candidatos(e) {
  const desc = norm(e.descricao), dig = soDig(e.descricao);
  const lista = e.valor > 0 ? db.titulos.filter(t => !t.pago) : db.pagar.filter(t => !t.pago);
  const usados = new Set(db.extrato.filter(x => x.conciliado && x.conciliado.tipo === (e.valor > 0 ? 'receber' : 'pagar')).flatMap(x => x.conciliado.ids));
  return lista.filter(t => !usados.has(t.id)).map(t => {
    let sc = 0; const dv = Math.abs(Math.abs(e.valor) - t.valor);
    if (dv < 0.01) sc += 50; else if (dv / t.valor < 0.03) sc += 20; // juros/desconto pequeno
    const dias = Math.abs((new Date(e.data) - new Date(t.vencimento)) / 864e5); sc += Math.max(0, 20 - dias);
    if (e.valor > 0) {
      const c = byId('clientes', t.clienteId) || {};
      if (soDig(c.cnpj).length >= 8 && dig.includes(soDig(c.cnpj).slice(0, 8))) sc += 40;
      if (norm(c.razao + ' ' + c.fantasia).split(/\W+/).some(w => w.length >= 4 && !['LTDA', 'COMERCIO', 'MERCADO', 'SUPERMERCADO'].includes(w) && desc.includes(w))) sc += 25;
      const ped = byId('pedidos', t.pedidoId); if (ped && desc.includes(String(ped.numero))) sc += 15;
    } else {
      const f = byId('fornecedores', t.fornecedorId) || {};
      if (soDig(f.cnpj).length >= 8 && dig.includes(soDig(f.cnpj).slice(0, 8))) sc += 40;
      if (norm(t.descricao + ' ' + (f.razao || '') + ' ' + (f.fantasia || '')).split(/\W+/).some(w => w.length >= 4 && desc.includes(w))) sc += 25;
      if (t.documento && desc.includes(norm(t.documento).split('/')[0])) sc += 15;
    }
    return { t, sc, exato: dv < 0.01 };
  }).sort((a, b) => b.sc - a.sc);
}
function sugestao(e) {
  if (e.conciliado) return null;
  const c = candidatos(e); if (!c.length) return null;
  const [a, b] = c;
  return a.exato && a.sc >= 60 && (!b || a.sc - b.sc >= 10) ? a.t : null;
}
const descTitulo = (t, tipo) => tipo === 'receber'
  ? `${esc((byId('clientes', t.clienteId) || {}).fantasia || '')} · pedido #${(byId('pedidos', t.pedidoId) || {}).numero || ''} ${t.parcela} · venc. ${fdate(t.vencimento)}`
  : `${esc(t.descricao)} ${t.parcela || ''} · venc. ${fdate(t.vencimento)}`;

/* ---------- Tela ---------- */
function celulaConc(e, sugMap) {
  const c = e.conciliado;
  if (c) {
    const det = c.tipo === 'avulso' ? `${esc(c.categoria)}${c.descricao && c.descricao !== e.descricao ? ' — ' + esc(c.descricao) : ''}`
      : c.ids.map(id => { const t = (c.tipo === 'receber' ? db.titulos : db.pagar).find(x => x.id === id); return t ? descTitulo(t, c.tipo) : '(título removido)'; }).join('<br>');
    return `<span class="badge b-ok">✓ ${c.tipo === 'receber' ? 'Recebimento' : c.tipo === 'pagar' ? 'Pagamento' : 'Avulso'}</span> <span class="hint">${det}</span>${c.diferenca && Math.abs(c.diferenca) > 0.05 ? `<div class="hint" style="color:var(--warn)">diferença ${brl(c.diferenca)}</div>` : ''}`;
  }
  const t = sugMap.get(e.id);
  return t ? `<span class="hint">Sugestão: <b>${descTitulo(t, e.valor > 0 ? 'receber' : 'pagar')}</b></span>` : '<span class="badge b-warn">Pendente</span>';
}

VIEWS.bancos = () => {
  const s = state;
  if (!db.bancos.length) {
    setActions(`<button class="btn pri" onclick="editar('bancos')">+ Nova conta bancária</button>`);
    $('#view').innerHTML = `<div class="card" style="max-width:640px"><h3>Cadastre sua primeira conta bancária</h3><p>Depois é só importar o extrato em formato <b>OFX</b> (todo banco oferece no internet banking, em “Extrato → Exportar/Salvar como OFX/Money”) e o sistema sugere com quais contas a receber e a pagar cada lançamento combina.</p>
      <p class="hint">Informe como saldo inicial o saldo do dia anterior ao primeiro extrato que você vai importar.</p><button class="btn pri" onclick="editar('bancos')">+ Nova conta bancária</button></div>`;
    return;
  }
  s.banco = s.banco && byId('bancos', s.banco) ? s.banco : db.bancos[0].id; s.sit = s.sit || 'pendente';
  const banco = byId('bancos', s.banco);
  const todos = db.extrato.filter(e => e.bancoId === s.banco);
  const rows = todos.filter(e => (s.sit === 'todos' || (s.sit === 'pendente' ? !e.conciliado : !!e.conciliado)) && match(s.q, e.descricao, e.documento, String(e.valor).replace('.', ','))
    && (!s.di || e.data >= s.di) && (!s.df || e.data <= s.df)).sort((a, b) => b.data.localeCompare(a.data) || a.descricao.localeCompare(b.descricao));
  const pend = todos.filter(e => !e.conciliado);
  const sugs = pend.map(e => [e, sugestao(e)]).filter(x => x[1]);
  // evita usar o mesmo título em duas sugestões
  const vistos = new Set(); const sugUnicas = sugs.filter(([, t]) => !vistos.has(t.id) && vistos.add(t.id));
  const sugMap = new Map(sugUnicas.map(([e, t]) => [e.id, t]));
  setActions(`<button class="btn" onclick="editar('bancos')">+ Nova conta</button><button class="btn pri" onclick="importarOFX('${s.banco}')">⬆ Importar extrato (OFX)</button>`);
  $('#view').innerHTML = `
  <div class="grid kpis" style="margin-bottom:14px">${db.bancos.map(b => {
    const p = db.extrato.filter(e => e.bancoId === b.id && !e.conciliado).length; const ult = db.extrato.filter(e => e.bancoId === b.id).map(e => e.data).sort().pop();
    return `<div class="card kpi" style="cursor:pointer;${b.id === s.banco ? 'border-color:var(--pri);box-shadow:0 0 0 1px var(--pri)' : ''}${b.ativo === 'Não' ? ';opacity:.6' : ''}" onclick="state.banco='${b.id}';render()">
      <div class="l">${esc(b.nome)}</div><div class="v" style="color:${saldoBanco(b) < 0 ? 'var(--bad)' : 'inherit'}">${brl(saldoBanco(b))}</div>
      <div class="s">${esc(b.banco)} ${b.agencia ? 'ag. ' + esc(b.agencia) : ''} ${b.conta ? 'c/c ' + esc(b.conta) : ''}<br>${ult ? 'extrato até ' + fdate(ult) : 'sem extrato'} · ${p ? `<b style="color:var(--warn)">${p} pendente(s)</b>` : 'tudo conciliado ✓'}</div></div>`;
  }).join('')}
  ${db.bancos.length > 1 ? `<div class="card kpi"><div class="l">Saldo total</div><div class="v">${brl(saldoBancos())}</div><div class="s">contas ativas</div></div>` : ''}</div>
  ${sugUnicas.length ? `<div class="card" style="margin-bottom:14px;border-color:var(--ok);display:flex;gap:12px;align-items:center;flex-wrap:wrap">✨ <span><b>${sugUnicas.length}</b> lançamento(s) com correspondência exata encontrada (mesmo valor, data próxima e nome).</span><span style="flex:1"></span><button class="btn pri" onclick="conciliarSugestoes()">Conciliar todos automaticamente</button></div>` : ''}
  <div class="filters">${[['pendente', `Pendentes (${pend.length})`], ['conciliado', 'Conciliados'], ['todos', 'Todos']].map(([k, l]) => `<button class="btn ${s.sit === k ? 'pri' : ''}" onclick="state.sit='${k}';render()">${l}</button>`).join('')}
    ${filtroTexto('Buscar descrição ou valor...')}<input type="date" value="${s.di || ''}" onchange="state.di=this.value;render()"><input type="date" value="${s.df || ''}" onchange="state.df=this.value;render()">
    <button class="btn" onclick="editar('bancos','${banco.id}')">Editar conta</button></div>
  ${tabela([['Data', e => fdate(e.data)], ['Descrição no extrato', e => `<div style="white-space:normal;min-width:180px"><b>${esc(e.descricao)}</b>${e.documento ? `<div class="hint">doc. ${esc(e.documento)}</div>` : ''}</div>`],
    ['Valor', e => `<b style="color:${e.valor < 0 ? 'var(--bad)' : 'var(--ok)'}">${brl(e.valor)}</b>`, 'num'],
    ['Conciliação', e => `<div style="white-space:normal;min-width:220px">${celulaConc(e, sugMap)}</div>`],
    ['', e => `<span class="row" style="justify-content:flex-end">${e.conciliado ? `<button class="btn sm" onclick="desfazerConc('${e.id}')">Desfazer</button>`
      : `${sugMap.get(e.id) ? `<button class="btn sm ok" onclick="aceitarSugestao('${e.id}','${sugMap.get(e.id).id}')">✓ Aceitar</button>` : ''}<button class="btn sm" onclick="abrirConciliacao('${e.id}')">Conciliar…</button>`}</span>`]],
    rows, todos.length ? 'Nenhum lançamento neste filtro' : 'Nenhum extrato importado. Clique em “Importar extrato (OFX)”.')}
  <p class="hint">Conciliar um crédito dá baixa nos títulos a receber escolhidos; um débito dá baixa nas contas a pagar. Tarifas e outros lançamentos sem título podem ser classificados como avulsos (débitos avulsos entram nas despesas por categoria). “Desfazer” reabre os títulos baixados pela conciliação.</p>`;
};
async function aceitarSugestao(eid, tid) {
  const e = db.extrato.find(x => x.id === eid);
  await acao(() => api('POST', `/api/extrato/${eid}/conciliar`, { tipo: e.valor > 0 ? 'receber' : 'pagar', ids: [tid] }), 'Conciliado');
}
async function conciliarSugestoes() {
  const pend = db.extrato.filter(e => e.bancoId === state.banco && !e.conciliado);
  const vistos = new Set(); const pares = pend.map(e => [e, sugestao(e)]).filter(([, t]) => t && !vistos.has(t.id) && vistos.add(t.id));
  if (!confirm(`Conciliar ${pares.length} lançamento(s) com as sugestões? Os títulos correspondentes receberão baixa na data do extrato.`)) return;
  let ok = 0, falha = 0;
  for (const [e, t] of pares) { try { await api('POST', `/api/extrato/${e.id}/conciliar`, { tipo: e.valor > 0 ? 'receber' : 'pagar', ids: [t.id] }); ok++; } catch (err) { falha++; } }
  render(); toast(`${ok} conciliado(s)` + (falha ? `, ${falha} com erro` : ''));
}
async function desfazerConc(id) {
  if (!confirm('Desfazer esta conciliação? Os títulos que foram baixados por ela voltam a ficar em aberto.')) return;
  await acao(() => api('POST', `/api/extrato/${id}/desfazer`), 'Conciliação desfeita');
}

/* ---------- Modal de conciliação manual ---------- */
let conc = null;
function abrirConciliacao(id) {
  const e = db.extrato.find(x => x.id === id);
  conc = { e, aba: 'titulos', sel: new Set(), q: '', categoria: '', descricao: '', fornecedorId: '' };
  const s = sugestao(e); if (s) conc.sel.add(s.id);
  if (/TARIFA|IOF|JUROS|ENCARGO|MANUT|CESTA|PACOTE/.test(norm(e.descricao)) && e.valor < 0) { conc.aba = 'avulso'; conc.categoria = 'Tarifas bancárias'; }
  if (/RENDIMENTO|RENDE FACIL|APLIC/.test(norm(e.descricao)) && e.valor > 0) { conc.aba = 'avulso'; conc.categoria = 'Rendimento de aplicação'; }
  telaConciliacao();
}
function telaConciliacao() {
  const { e } = conc; const credito = e.valor > 0; const tipo = credito ? 'receber' : 'pagar';
  const cands = candidatos(e).filter(({ t }) => {
    if (!conc.q) return true;
    const extra = credito ? ((byId('clientes', t.clienteId) || {}).razao + ' ' + (byId('clientes', t.clienteId) || {}).fantasia) : (t.descricao + ' ' + nomeForn(t.fornecedorId));
    return match(conc.q, extra, String(t.valor).replace('.', ','), (byId('pedidos', t.pedidoId) || {}).numero);
  }).slice(0, 60);
  const lista = credito ? db.titulos : db.pagar;
  const soma = [...conc.sel].reduce((s, id) => s + ((lista.find(t => t.id === id) || {}).valor || 0), 0);
  const dif = Math.round((Math.abs(e.valor) - soma) * 100) / 100;
  const cats = credito ? CATEGORIAS_ENTRADA : Regras.CATEGORIAS_PAGAR;
  openModal(`<h2>Conciliar lançamento</h2>
   <div class="card" style="padding:12px;margin-bottom:12px"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><span>${fdate(e.data)} · <b>${esc(e.descricao)}</b></span><b style="font-size:18px;color:${credito ? 'var(--ok)' : 'var(--bad)'}">${brl(e.valor)}</b></div></div>
   <div class="filters"><button class="btn ${conc.aba === 'titulos' ? 'pri' : ''}" onclick="conc.aba='titulos';telaConciliacao()">${credito ? 'Contas a receber' : 'Contas a pagar'}</button>
     <button class="btn ${conc.aba === 'avulso' ? 'pri' : ''}" onclick="conc.aba='avulso';telaConciliacao()">Lançamento avulso${credito ? '' : ' (tarifa, despesa sem título)'}</button></div>
   ${conc.aba === 'titulos' ? `
     <input placeholder="Filtrar por ${credito ? 'cliente, nº do pedido' : 'descrição, fornecedor'} ou valor..." value="${esc(conc.q)}" oninput="conc.q=this.value;clearTimeout(window._cq);window._cq=setTimeout(()=>{telaConciliacao();const i=document.querySelector('.modal input');i.focus();i.setSelectionRange(i.value.length,i.value.length)},250)" style="margin-bottom:10px">
     <div class="tbl-wrap" style="max-height:340px"><table><thead><tr><th></th><th>Título em aberto</th><th class="num">Valor</th><th class="num">Compatibilidade</th></tr></thead><tbody>
     ${cands.map(({ t, sc, exato }) => `<tr style="cursor:pointer" onclick="concToggle('${t.id}')"><td><input type="checkbox" style="width:auto" ${conc.sel.has(t.id) ? 'checked' : ''}></td>
       <td style="white-space:normal">${descTitulo(t, tipo)}</td><td class="num">${brl(t.valor)}${exato ? ' <span class="badge b-ok">=</span>' : ''}</td>
       <td class="num"><div class="bar" style="width:70px;display:inline-block"><i style="width:${Math.min(100, sc)}%;background:${sc >= 60 ? 'var(--ok)' : sc >= 35 ? 'var(--warn)' : 'var(--muted)'}"></i></div></td></tr>`).join('') || `<tr><td colspan="4" class="muted" style="text-align:center;padding:20px">Nenhum título em aberto${conc.q ? ' para este filtro' : ''}.</td></tr>`}
     </tbody></table></div>
     <div class="totals" style="margin-top:10px"><div><span>Selecionado (${conc.sel.size})</span><span>${brl(soma)}</span></div><div><span>Lançamento</span><span>${brl(Math.abs(e.valor))}</span></div>
       <div class="g"><span>Diferença</span><span style="color:${Math.abs(dif) <= 0.05 ? 'var(--ok)' : 'var(--warn)'}">${brl(dif)}</span></div></div>
     ${conc.sel.size && Math.abs(dif) > 0.05 ? `<p class="hint" style="color:var(--warn)">${dif > 0 ? (credito ? 'O cliente pagou a mais (juros/multa?).' : 'Você pagou a mais (juros/multa?).') : (credito ? 'O cliente pagou a menos (desconto?).' : 'Você pagou a menos (desconto?).')} Os títulos serão baixados mesmo assim${conc.sel.size === 1 ? ', registrando o valor efetivo do extrato' : ''}.</p>` : ''}
     <div class="actions"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn pri" ${conc.sel.size ? '' : 'disabled'} onclick="confirmarConc()">Conciliar e dar baixa</button></div>`
    : `<div class="form"><div><label>Categoria</label><select onchange="conc.categoria=this.value"><option value="">Selecione...</option>${cats.map(c => `<option ${c === conc.categoria ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
       ${credito ? '' : `<div><label>Fornecedor (opcional)</label><select onchange="conc.fornecedorId=this.value"><option value="">— nenhum —</option>${db.fornecedores.map(f => `<option value="${f.id}" ${conc.fornecedorId === f.id ? 'selected' : ''}>${esc(f.fantasia || f.razao)}</option>`).join('')}</select></div>`}
       <div class="full"><label>Descrição</label><input value="${esc(conc.descricao || e.descricao)}" onchange="conc.descricao=this.value"></div></div>
       <p class="hint">${credito ? 'Entradas avulsas ficam apenas classificadas no extrato (não são vendas).' : 'O débito será registrado como despesa paga em Contas a pagar, na categoria escolhida.'}</p>
       <div class="actions"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn pri" onclick="confirmarConc()">Classificar</button></div>`}`, true);
}
function concToggle(id) { conc.sel.has(id) ? conc.sel.delete(id) : conc.sel.add(id); telaConciliacao(); }
async function confirmarConc(forcar) {
  const { e } = conc;
  const body = conc.aba === 'avulso' ? { tipo: 'avulso', categoria: conc.categoria, descricao: conc.descricao, fornecedorId: conc.fornecedorId }
    : { tipo: e.valor > 0 ? 'receber' : 'pagar', ids: [...conc.sel], forcar };
  if (body.tipo === 'avulso' && !body.categoria) return toast('Selecione a categoria');
  try { await api('POST', `/api/extrato/${e.id}/conciliar`, body); closeModal(); render(); toast('Conciliado'); }
  catch (err) {
    if (err.status === 409 && confirm(err.message + '\n\nConciliar mesmo assim?')) return confirmarConc(true);
    if (err.status !== 409 && err.status !== 401) alert(err.message);
  }
}
