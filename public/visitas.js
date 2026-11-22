/* DistribPro — agenda de visitas, roteiro, check-in com GPS e relatório de visitas */
'use strict';
SCHEMAS.clientes.fields.push(
  ['diaVisita', 'Dia de visita', 'select', () => Regras.DIAS_SEMANA.map((d, i) => [String(i), d])],
  ['frequencia', 'Frequência de visita', 'select', () => [['7', 'Semanal'], ['14', 'Quinzenal'], ['28', 'Mensal']]],
  ['lat', 'Latitude (preenchida no 1º check-in)', 'number'], ['lng', 'Longitude', 'number']);

const fhora = iso => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const fdist = m => m == null ? '' : m < 1000 ? `${m} m` : `${num(m / 1000, 1)} km`;
const LIMITE_DIST = 300; // metros: check-in mais longe que isso é sinalizado
const temGeo = c => c && Number(c.lat) && Number(c.lng);
const destinoMaps = c => temGeo(c) ? `${c.lat},${c.lng}` : encodeURIComponent([c.logradouro, c.numero, c.bairro, c.cidade, c.uf].filter(Boolean).join(', '));
const duracao = v => v.checkin && v.checkout && !v.checkin.automatico ? Math.max(0, Math.round((new Date(v.checkout.em) - new Date(v.checkin.em)) / 60000)) : null;
const VIS_BADGE = { 'Agendada': '', 'Realizada': 'b-ok', 'Não realizada': 'b-bad' };

// maximumAge 0: sempre posição nova (com cache o check-in herdaria a posição do cliente anterior)
function posicaoAtual(timeout = 10000) {
  return new Promise(ok => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }), () => ok(null), { enableHighAccuracy: true, timeout, maximumAge: 0 });
  });
}
/** Envia uma ação de visita; sem internet, guarda na fila e aplica na tela. */
async function acaoVisita(v, acao, dados) {
  dados = { ...dados, em: new Date().toISOString() };
  if (OFF.online) {
    try { await api('POST', `/api/visitas/${v.id}/${acao}`, dados); return true; }
    catch (e) { if (e.status !== 0) { if (e.status !== 401) alert(e.message); return false; } }
  }
  await enfileirarVisita(v.id, acao, dados);
  toast('📴 Sem internet: registrado no aparelho, será enviado quando a conexão voltar.');
  return true;
}

/* ================== AGENDA ================== */
VIEWS.agenda = () => {
  if (isCli()) return go('catalogo');
  const s = state; s.dia = s.dia || today();
  if (isAdmin()) s.vd = s.vd && byId('vendedores', s.vd) ? s.vd : (db.vendedores[0] || {}).id;
  const vid = isVend() ? db.me.vendedorId : s.vd;
  const lista = db.visitas.filter(v => v.vendedorId === vid && v.data === s.dia).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const feitas = lista.filter(v => v.status !== 'Agendada').length, comPedido = lista.filter(v => v.pedidoId).length;
  const abertas = lista.filter(v => v.status === 'Agendada');
  const rota = abertas.map(v => byId('clientes', v.clienteId)).filter(Boolean);
  const urlRota = rota.length ? `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${destinoMaps(rota[rota.length - 1])}${rota.length > 1 ? '&waypoints=' + rota.slice(0, -1).slice(0, 9).map(destinoMaps).join('%7C') : ''}` : '';
  const diaNome = Regras.DIAS_SEMANA[Regras.diaSemana(s.dia)];
  setActions(`<button class="btn" onclick="gerarRoteiro()">🗓️ Gerar roteiro</button><button class="btn pri" onclick="agendarVisita()">+ Agendar visita</button>`);
  $('#view').innerHTML = `
  <div class="filters" style="align-items:center">
    <button class="btn" onclick="state.dia=addDays(state.dia,-1);render()">◀</button>
    <input type="date" value="${s.dia}" onchange="state.dia=this.value||today();render()" style="min-width:150px">
    <button class="btn" onclick="state.dia=addDays(state.dia,1);render()">▶</button>
    ${s.dia !== today() ? `<button class="btn" onclick="state.dia=today();render()">Hoje</button>` : ''}
    <b style="margin-left:4px">${diaNome}${s.dia === today() ? ' · hoje' : ''}</b>
    ${isAdmin() ? `<select onchange="state.vd=this.value;render()" style="margin-left:auto">${db.vendedores.map(v => `<option value="${v.id}" ${v.id === vid ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}</select>` : ''}
  </div>
  ${lista.length ? `<div class="card" style="margin-bottom:14px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">
    <div style="flex:1;min-width:200px"><div class="row" style="justify-content:space-between"><b>${feitas} de ${lista.length} visitas concluídas</b><span class="muted">${comPedido} com pedido</span></div>
      <div class="bar" style="margin-top:6px"><i style="width:${lista.length ? feitas / lista.length * 100 : 0}%;background:var(--ok)"></i></div></div>
    ${urlRota ? `<a class="btn pri" href="${urlRota}" target="_blank" rel="noopener">🗺️ ${rota.length === 1 ? 'Rota até a próxima visita' : `Rota das ${rota.length} visitas pendentes`}</a>` : ''}</div>` : ''}
  ${lista.map((v, i) => cartaoVisita(v, i, lista.length)).join('') || `<div class="card muted" style="text-align:center;padding:30px">Nenhuma visita para ${diaNome.toLowerCase()}, ${fdate(s.dia)}.<br><br><button class="btn pri" onclick="agendarVisita()">+ Agendar visita</button> <button class="btn" onclick="gerarRoteiro()">Gerar roteiro</button></div>`}`;
};
function cartaoVisita(v, i, n) {
  const c = byId('clientes', v.clienteId) || {};
  const ult = db.pedidos.filter(p => p.clienteId === c.id && Regras.vendaValida(p)).map(p => p.data).sort().pop();
  const venc = db.titulos.filter(t => t.clienteId === c.id && !t.pago && t.vencimento < today());
  const ped = v.pedidoId && byId('pedidos', v.pedidoId);
  const ck = v.checkin; const longe = ck && ck.distancia > LIMITE_DIST;
  const pend = v._pendente ? ' <span class="badge b-warn">aguardando envio</span>' : '';
  const editavel = isAdmin() || v.vendedorId === db.me.vendedorId;
  let acoes = '';
  if (v.status === 'Agendada' && !ck) acoes = `<button class="btn pri" onclick="checkin('${v.id}')">📍 Check-in</button>
      <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${destinoMaps(c)}" target="_blank" rel="noopener">Como chegar</a>
      <button class="btn" onclick="encerrarVisita('${v.id}',false)">Não realizada</button>
      ${i > 0 ? `<button class="btn sm" title="Subir" onclick="moverVisita('${v.id}',-1)">↑</button>` : ''}${i < n - 1 ? `<button class="btn sm" title="Descer" onclick="moverVisita('${v.id}',1)">↓</button>` : ''}
      <button class="btn sm" onclick="agendarVisita('${v.id}')">Editar</button>`;
  else if (v.status === 'Agendada') acoes = `${ped ? '' : `<button class="btn pri" onclick="pedidoDaVisita('${v.id}')">🛒 Fazer pedido</button>`}<button class="btn ${ped ? 'pri' : ''}" onclick="encerrarVisita('${v.id}',true)">✔ Encerrar visita</button>`;
  return `<div class="card" style="margin-bottom:10px;${v.status === 'Agendada' && ck ? 'border-color:var(--pri);box-shadow:0 0 0 1px var(--pri)' : ''}">
    <div class="row" style="align-items:flex-start;gap:12px">
      <div style="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;flex-shrink:0;font-weight:700;background:${v.status === 'Realizada' ? 'var(--ok)' : v.status === 'Não realizada' ? 'var(--bad)' : ck ? 'var(--pri)' : 'var(--panel2)'};color:${v.status !== 'Agendada' || ck ? '#fff' : 'var(--text)'};border:1px solid var(--line)">${v.status === 'Realizada' ? '✓' : v.status === 'Não realizada' ? '✕' : i + 1}</div>
      <div style="flex:1;min-width:0">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap"><b style="font-size:15px;cursor:pointer" onclick="verCliente('${c.id}')">${esc(c.fantasia || c.razao)}</b>
          <span>${v.hora ? `<span class="muted">${esc(v.hora)}</span> ` : ''}<span class="badge ${VIS_BADGE[v.status]}">${ck && v.status === 'Agendada' ? 'Em visita' : v.status}</span>${pend}</span></div>
        <div class="hint">${esc([c.logradouro, c.numero, c.bairro, c.cidade].filter(Boolean).join(', '))}${c.telefone ? ' · ' + esc(c.telefone) : ''}</div>
        <div class="hint">Última compra: ${ult ? fdate(ult) : 'nunca'}${venc.length ? ` · <b style="color:var(--bad)">${venc.length} título(s) vencido(s): ${brl(venc.reduce((a, t) => a + t.valor, 0))}</b>` : ''}</div>
        ${v.objetivo ? `<div class="hint">🎯 ${esc(v.objetivo)}</div>` : ''}
        ${ck ? `<div class="hint" style="margin-top:4px">📍 Check-in ${fhora(ck.em)}${ck.semGps ? ' (sem GPS)' : ck.distancia != null ? ` · <span style="color:${longe ? 'var(--bad)' : 'var(--ok)'}">${longe ? '⚠️ ' : ''}a ${fdist(ck.distancia)} do cliente</span>` : ck.localSalvo ? ' · localização do cliente salva' : ''}${v.checkout ? ` · saída ${fhora(v.checkout.em)}${duracao(v) != null ? ` (${duracao(v) < 1 ? 'menos de 1' : duracao(v)} min)` : ''}` : ''}</div>` : ''}
        ${v.status !== 'Agendada' ? `<div class="hint">${v.status === 'Realizada' ? '✅' : '❌'} ${esc(v.resultado || '')}${ped ? ` — <a style="cursor:pointer" onclick="verPedido('${ped.id}')">${ped._offline ? 'pedido offline' : 'pedido #' + ped.numero} · ${brl(totalPedido(ped))}</a>` : ''}${v.obs ? ' · ' + esc(v.obs) : ''}</div>`
          : ped ? `<div class="hint">🛒 <a style="cursor:pointer" onclick="verPedido('${ped.id}')">${ped._offline ? 'Pedido offline' : 'Pedido #' + ped.numero} · ${brl(totalPedido(ped))}</a></div>` : ''}
        ${acoes && editavel ? `<div class="row" style="margin-top:10px;flex-wrap:wrap;gap:6px">${acoes}</div>` : ''}
      </div></div></div>`;
}
async function checkin(id) {
  const v = byId('visitas', id); const c = byId('clientes', v.clienteId) || {};
  toast('Obtendo sua localização...');
  const pos = await posicaoAtual();
  if (!pos && !confirm('Não foi possível obter a localização (GPS desligado ou permissão negada). Fazer o check-in sem localização?')) return;
  let salvarLocal = false;
  if (pos && !temGeo(c)) salvarLocal = confirm(`${c.fantasia || c.razao} ainda não tem localização cadastrada.\n\nVocê está no cliente agora? Se sim, sua posição atual será salva como a localização dele.`);
  if (await acaoVisita(v, 'checkin', { ...(pos || {}), salvarLocal })) { render(); toast('Check-in registrado'); }
}
function pedidoDaVisita(id) { const v = byId('visitas', id); novoPedido(v.clienteId); draft.visitaId = v.id; editorPedido(); }
function encerrarVisita(id, realizada) {
  const v = byId('visitas', id); const c = byId('clientes', v.clienteId) || {};
  const motivos = realizada ? Regras.MOTIVOS_SEM_PEDIDO : Regras.MOTIVOS_NAO_REALIZADA;
  openModal(`<h2>${realizada ? 'Encerrar visita' : 'Visita não realizada'} — ${esc(c.fantasia || c.razao)}</h2>
    ${realizada && v.pedidoId ? '<p>✅ Pedido registrado nesta visita.</p>' : `<label>${realizada ? 'Por que não houve pedido?' : 'Motivo'}</label><select id="encMot"><option value="">Selecione...</option>${motivos.map(m => `<option>${m}</option>`).join('')}</select>`}
    <label style="margin-top:10px">Observações (opcional)</label><textarea id="encObs" rows="3" placeholder="Ex.: comprador pediu retorno na sexta; concorrente com preço menor no item X">${esc(v.obs || '')}</textarea>
    <div class="actions"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn pri" onclick="confirmarEncerrar('${id}',${realizada})">Confirmar</button></div>`);
}
async function confirmarEncerrar(id, realizada) {
  const v = byId('visitas', id); const mot = $('#encMot') ? $('#encMot').value : '';
  if (!(realizada && v.pedidoId) && !mot) return toast('Selecione o motivo');
  const pos = realizada ? await posicaoAtual(5000) : null;
  if (await acaoVisita(v, 'encerrar', { realizada, motivo: mot, obs: $('#encObs').value, ...(pos || {}) })) { closeModal(); render(); toast('Visita encerrada'); }
}
async function moverVisita(id, dir) {
  const v = byId('visitas', id);
  const lista = db.visitas.filter(x => x.vendedorId === v.vendedorId && x.data === v.data).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const i = lista.indexOf(v), j = i + dir; if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  await acao(() => api('POST', '/api/visitas/ordem', { ids: lista.map(x => x.id) }));
}
function agendarVisita(id) {
  const v = id ? byId('visitas', id) : { data: state.dia || today(), clienteId: '', hora: '', objetivo: '', obs: '' };
  const vid = isVend() ? db.me.vendedorId : state.vd;
  const clientes = db.clientes.filter(c => c.ativo !== 'Não' && (isVend() || !vid || c.vendedorId === vid || c.id === v.clienteId));
  openModal(`<h2>${id ? 'Editar visita' : 'Agendar visita'}</h2><div class="form">
    <div class="full"><label>Cliente</label><select id="avCli"><option value="">Selecione...</option>${clientes.map(c => `<option value="${c.id}" ${c.id === v.clienteId ? 'selected' : ''}>${esc(c.fantasia)} — ${esc(c.cidade)}</option>`).join('')}</select></div>
    <div><label>Data</label><input id="avData" type="date" value="${v.data}"></div><div><label>Horário (opcional)</label><input id="avHora" type="time" value="${esc(v.hora)}"></div>
    <div class="full"><label>Objetivo da visita (opcional)</label><input id="avObj" value="${esc(v.objetivo || '')}" placeholder="Ex.: apresentar lançamento, cobrar título vencido, positivar linha de limpeza"></div></div>
    <div class="actions">${id ? `<button class="btn danger" onclick="excluirVisita('${id}')">Excluir</button>` : ''}<span style="flex:1"></span><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn pri" onclick="salvarVisita('${id || ''}')">Salvar</button></div>`);
}
async function salvarVisita(id) {
  const b = { id: id || undefined, clienteId: $('#avCli').value, data: $('#avData').value, hora: $('#avHora').value, objetivo: $('#avObj').value, vendedorId: isAdmin() ? state.vd : undefined };
  if (isAdmin()) { const c = byId('clientes', b.clienteId); if (c && c.vendedorId !== state.vd && !confirm(`Este cliente é da carteira de ${(byId('vendedores', c.vendedorId) || {}).nome}. Agendar para ${(byId('vendedores', state.vd) || {}).nome} mesmo assim?`)) return; }
  if (await acao(() => api('PUT', '/api/visitas', b), 'Visita salva')) { closeModal(); state.dia = b.data; render(); }
}
async function excluirVisita(id) { if (confirm('Excluir esta visita da agenda?') && await acao(() => api('DELETE', '/api/visitas/' + id), 'Visita excluída')) closeModal(); }
function gerarRoteiro() {
  const ini = state.dia && state.dia > today() ? state.dia : today();
  const semCfg = db.clientes.filter(c => c.ativo !== 'Não' && (isVend() || !state.vd || c.vendedorId === state.vd) && !(c.diaVisita !== '' && c.diaVisita != null && Number(c.frequencia) > 0)).length;
  openModal(`<h2>Gerar roteiro de visitas</h2>
    <p>Agenda automaticamente os clientes${isAdmin() ? ' do vendedor selecionado' : ' da sua carteira'} no <b>dia de visita</b> de cada um, respeitando a <b>frequência</b> (semanal, quinzenal ou mensal) a partir da última visita. Visitas já agendadas não são duplicadas.</p>
    ${semCfg ? `<p class="hint" style="color:var(--warn)">${semCfg} cliente(s) sem dia/frequência de visita definidos — configure no cadastro do cliente.</p>` : ''}
    <div class="form"><div><label>De</label><input id="grDe" type="date" value="${ini}"></div><div><label>Até</label><input id="grAte" type="date" value="${addDays(ini, 6)}"></div></div>
    ${isAdmin() ? `<label style="margin-top:10px"><input type="checkbox" id="grTodos" style="width:auto"> Gerar para todos os vendedores</label>` : ''}
    <div class="actions"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn pri" onclick="confirmarRoteiro()">Gerar</button></div>`);
}
async function confirmarRoteiro() {
  const b = { de: $('#grDe').value, ate: $('#grAte').value, vendedorId: isAdmin() && !($('#grTodos') && $('#grTodos').checked) ? state.vd : undefined };
  const r = await acao(() => api('POST', '/api/visitas/gerar', b));
  if (r) { closeModal(); toast(r.criadas ? `${r.criadas} visita(s) agendada(s)` : 'Nenhuma visita nova: o roteiro já estava em dia'); }
}

/* ================== RELATÓRIO DE VISITAS ================== */
VIEWS.visitas = () => {
  const s = state; s.di = s.di || today().slice(0, 8) + '01'; s.df = s.df || today();
  const vs = db.visitas.filter(v => v.data >= s.di && v.data <= s.df && (!s.vd || v.vendedorId === s.vd));
  const ate = vs.filter(v => v.data <= today());
  const linha = vid => {
    const l = ate.filter(v => v.vendedorId === vid); const real = l.filter(v => v.status === 'Realizada');
    const durs = real.map(duracao).filter(x => x != null);
    return { vend: byId('vendedores', vid), plan: l.length, real: real.length, nao: l.filter(v => v.status === 'Não realizada').length, pend: l.filter(v => v.status === 'Agendada').length,
      pos: real.filter(v => v.pedidoId).length, tempo: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
      longe: real.filter(v => v.checkin && v.checkin.distancia > LIMITE_DIST).length, semGps: real.filter(v => v.checkin && v.checkin.semGps).length };
  };
  const rows = db.vendedores.filter(v => !s.vd || v.id === s.vd).map(v => linha(v.id)).filter(r => r.plan);
  const tot = rows.reduce((a, r) => ({ plan: a.plan + r.plan, real: a.real + r.real, pos: a.pos + r.pos, longe: a.longe + r.longe }), { plan: 0, real: 0, pos: 0, longe: 0 });
  const motivos = {}; ate.filter(v => v.status !== 'Agendada' && !v.pedidoId && v.resultado).forEach(v => motivos[v.resultado] = (motivos[v.resultado] || 0) + 1);
  const mot = Object.entries(motivos).sort((a, b) => b[1] - a[1]); const motMax = mot[0] ? mot[0][1] : 1;
  const pct = (a, b) => b ? num(a / b * 100) + '%' : '—';
  const alertas = ate.filter(v => v.checkin && (v.checkin.distancia > LIMITE_DIST || v.checkin.semGps) && v.status === 'Realizada').sort((a, b) => b.data.localeCompare(a.data));
  $('#view').innerHTML = `<div class="filters"><input type="date" value="${s.di}" onchange="state.di=this.value;render()"><input type="date" value="${s.df}" onchange="state.df=this.value;render()">${selVendedor()}</div>
  <div class="grid kpis" style="margin-bottom:14px">
    <div class="card kpi"><div class="l">Visitas planejadas</div><div class="v">${tot.plan}</div><div class="s">até hoje no período</div></div>
    <div class="card kpi"><div class="l">Execução do roteiro</div><div class="v">${pct(tot.real, tot.plan)}</div><div class="s">${tot.real} realizadas</div></div>
    <div class="card kpi"><div class="l">Positivação</div><div class="v" style="color:var(--ok)">${pct(tot.pos, tot.real)}</div><div class="s">visitas que viraram pedido</div></div>
    <div class="card kpi"><div class="l">Check-ins distantes</div><div class="v" style="color:${tot.longe ? 'var(--bad)' : 'inherit'}">${tot.longe}</div><div class="s">a mais de ${LIMITE_DIST} m do cliente</div></div></div>
  ${tabela([['Vendedor', r => `<b>${esc(r.vend.nome)}</b>`], ['Planejadas', r => r.plan, 'num'], ['Realizadas', r => r.real, 'num'], ['Não realizadas', r => r.nao, 'num'], ['Em atraso', r => r.pend ? `<span style="color:var(--warn)">${r.pend}</span>` : 0, 'num'],
    ['Execução', r => pct(r.real, r.plan), 'num'], ['Positivação', r => `<b>${pct(r.pos, r.real)}</b>`, 'num'], ['Tempo médio', r => r.tempo != null ? r.tempo + ' min' : '—', 'num'],
    ['Alertas GPS', r => r.longe || r.semGps ? `<span style="color:var(--bad)">${r.longe} longe · ${r.semGps} sem GPS</span>` : '<span class="muted">—</span>']], rows, 'Nenhuma visita no período')}
  <div class="grid half" style="margin-top:14px;align-items:start">
    <div class="card"><h3>Motivos de visita sem pedido</h3>${mot.map(([m, n]) => `<div style="margin-bottom:8px"><div class="row" style="justify-content:space-between"><span>${esc(m)}</span><b>${n}</b></div><div class="bar" style="margin-top:3px"><i style="width:${n / motMax * 100}%;background:var(--warn)"></i></div></div>`).join('') || '<p class="muted">Nenhum registro.</p>'}</div>
    <div class="card"><h3>Check-ins a conferir</h3>${alertas.slice(0, 12).map(v => { const c = byId('clientes', v.clienteId) || {}; return `<div class="list-item"><span>${fdate(v.data)} · ${esc(c.fantasia)}<div class="hint">${esc((byId('vendedores', v.vendedorId) || {}).nome || '')}</div></span><span style="color:var(--bad)">${v.checkin.semGps ? 'sem GPS' : 'a ' + fdist(v.checkin.distancia)}</span></div>`; }).join('') || '<p class="muted">Nenhum check-in fora do cliente. ✅</p>'}</div>
  </div>`;
};
