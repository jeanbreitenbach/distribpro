/* DistribPro — modo offline: app instalável, última cópia dos dados no aparelho e fila de pedidos.
   Carregado antes do app.js; usa db, api, render etc. só quando chamado. */
'use strict';
const OFF = { online: true, fila: [], sincronizando: false, snapEm: null, instalar: null, _t: null };

/* ---------- IndexedDB (chave/valor) ---------- */
const idb = (() => {
  let conexao;
  const abrir = () => conexao || (conexao = new Promise((ok, falha) => {
    const r = indexedDB.open('distribpro', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error);
  }));
  const tx = async (modo, fn) => {
    try {
      const d = await abrir();
      return await new Promise((ok, falha) => { const t = d.transaction('kv', modo); const req = fn(t.objectStore('kv')); t.oncomplete = () => ok(req && req.result); t.onerror = () => falha(t.error); });
    } catch (e) { return undefined; } // navegador sem IndexedDB (aba anônima etc.): segue sem modo offline
  };
  return { get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)) };
})();
const novoIdLocal = () => (self.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
function uidDoToken(t) {
  try { let b = String(t).split('.')[0].replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '='; return JSON.parse(atob(b)).uid; } catch (e) { return null; }
}

/* ---------- Cópia local dos dados ---------- */
/** Chamado pelo api() sempre que chegam dados novos do servidor. */
function aoReceberDados() {
  const json = JSON.stringify(db); const uid = db.me.id; OFF.snapEm = Date.now();
  clearTimeout(OFF._t); OFF._t = setTimeout(() => idb.set('snap', { uid, em: OFF.snapEm, json }), 300);
  mesclarFila();
}
async function abrirOffline() {
  const s = await idb.get('snap');
  if (!s || !token || s.uid !== uidDoToken(token)) return false;
  db = JSON.parse(s.json); OFF.snapEm = s.em; OFF.online = false; mesclarFila(); iniciarApp(); return true;
}

/* ---------- Fila de pedidos feitos sem internet ---------- */
async function carregarFila() { OFF.fila = (await idb.get('fila')) || []; }
const minhaFila = () => db ? OFF.fila.filter(e => e.uid === db.me.id) : [];
/** Mostra os pedidos da fila junto com os do servidor (marcados como offline). */
function mesclarFila() {
  if (!db) return;
  db.pedidos = db.pedidos.filter(p => !p._offline);
  const fila = minhaFila();
  fila.filter(e => !e.tipo).forEach((e, i) => {
    db.pedidos.push({ ...e.pedido, id: e.idLocal, numero: 1e9 + i, status: 'Aguardando envio', _offline: true, _erro: e.erro, _aprovar: e.aprovar,
      criadoEm: e.criadoEm, origem: isCli() ? 'Portal B2B' : isVend() ? 'Vendedor' : 'Escritório', criadoPor: db.me.nome });
    const v = e.pedido.visitaId && (db.visitas || []).find(x => x.id === e.pedido.visitaId); if (v && !v.pedidoId) v.pedidoId = e.idLocal;
  });
  // check-ins e encerramentos de visita feitos sem internet: aplica na tela até serem enviados
  fila.filter(e => e.tipo === 'visita').forEach(e => {
    const v = (db.visitas || []).find(x => x.id === e.visitaId); if (!v) return;
    const d = e.dados; v._pendente = true;
    if (e.acao === 'checkin' && !v.checkin) {
      const c = byId('clientes', v.clienteId) || {};
      v.checkin = d.lat != null ? { em: d.em, lat: d.lat, lng: d.lng, precisao: d.precisao, ...(Number(c.lat) ? { distancia: Regras.distancia(d.lat, d.lng, c.lat, c.lng) } : {}) } : { em: d.em, semGps: true };
    }
    if (e.acao === 'encerrar' && v.status === 'Agendada') {
      if (d.realizada && !v.checkin) v.checkin = { em: d.em, semGps: true, automatico: true };
      Object.assign(v, { status: d.realizada ? 'Realizada' : 'Não realizada', resultado: d.realizada && v.pedidoId ? 'Pedido realizado' : d.motivo, checkout: { em: d.em }, obs: d.obs || v.obs });
    }
  });
}
async function enfileirarVisita(visitaId, acao, dados) {
  OFF.fila.push({ tipo: 'visita', idLocal: novoIdLocal(), uid: db.me.id, visitaId, acao, dados, criadoEm: new Date().toISOString(), erro: '' });
  await idb.set('fila', OFF.fila); mesclarFila(); atualizarBarra();
}
async function enfileirar(d, aprovar) {
  const { _offline, _erro, _aprovar, numero, status, criadoPor, origem, ...ped } = d;
  ped.id = null; ped.criadoOffline = true; if (!ped.idLocal) ped.idLocal = novoIdLocal();
  const ant = OFF.fila.find(x => x.idLocal === ped.idLocal);
  const e = { idLocal: ped.idLocal, uid: db.me.id, pedido: ped, aprovar: !!aprovar, criadoEm: ant ? ant.criadoEm : new Date().toISOString(), erro: '' };
  OFF.fila = OFF.fila.filter(x => x.idLocal !== e.idLocal).concat(e);
  await idb.set('fila', OFF.fila); mesclarFila(); atualizarBarra();
  return e.idLocal;
}
async function excluirOffline(idLocal) {
  if (!confirm('Excluir este pedido que ainda não foi enviado? Ele só existe neste aparelho.')) return;
  OFF.fila = OFF.fila.filter(x => x.idLocal !== idLocal); await idb.set('fila', OFF.fila);
  mesclarFila(); closeModal(); render(); atualizarBarra(); toast('Pedido excluído');
}
/** Envia os pedidos da fila. O idLocal garante que um reenvio não duplica o pedido no servidor. */
async function sincronizar(silencioso) {
  if (OFF.sincronizando || !db || !minhaFila().length) return;
  OFF.sincronizando = true; atualizarBarra();
  let ok = 0; const erros = [];
  for (const e of minhaFila()) {
    try {
      if (e.tipo === 'visita') await api('POST', `/api/visitas/${e.visitaId}/${e.acao}`, e.dados);
      else await api('POST', '/api/pedidos', { pedido: e.pedido, aprovar: e.aprovar });
      OFF.fila = OFF.fila.filter(x => x.idLocal !== e.idLocal); ok++; }
    catch (err) {
      if (err.status === 0 || err.status === 401) break; // sem rede ou sessão expirada: tenta de novo depois
      e.erro = err.message; erros.push(err.message);
    }
  }
  await idb.set('fila', OFF.fila); OFF.sincronizando = false;
  if (!db) return; // sessão expirou durante o envio
  mesclarFila(); atualizarBarra(); if (!modalAberto()) render();
  if (ok) toast(`✅ ${ok} registro(s) feito(s) offline enviado(s) ao servidor`);
  if (erros.length && !silencioso) alert(`${erros.length} registro(s) foram recusados pelo servidor e continuam no aparelho para você corrigir:\n\n• ` + [...new Set(erros)].join('\n• '));
}

/* ---------- Estado da conexão ---------- */
function setOnline(v) {
  const mudou = OFF.online !== v; OFF.online = v; atualizarBarra();
  if (v && mudou && minhaFila().length) sincronizar(true);
}
async function verificarConexao() {
  if (!db) return;
  try { await api('GET', '/api/data'); if (!modalAberto()) rerender(); } catch (e) { }
}
window.addEventListener('online', verificarConexao);
window.addEventListener('offline', () => setOnline(false));

function atualizarBarra() {
  const el = document.getElementById('offbar'); if (!el || !db) return;
  const fila = minhaFila(); const comErro = fila.filter(e => e.erro).length;
  const np = fila.filter(e => !e.tipo).length, nv = fila.length - np;
  const rot = [np ? `${np} pedido(s)` : '', nv ? `${nv} registro(s) de visita` : ''].filter(Boolean).join(' e ');
  const quando = OFF.snapEm ? new Date(OFF.snapEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  let html = '';
  if (!OFF.online) html = `<span>📴 <b>Sem internet</b> — mostrando os dados de ${quando}. Pedidos novos ficam salvos no aparelho${fila.length ? ` (<a style="cursor:pointer;text-decoration:underline" onclick="go('${np ? 'pedidos' : 'agenda'}')">${rot} aguardando envio</a>)` : ''}.</span><span style="flex:1"></span><button class="btn sm" onclick="verificarConexao()">Tentar de novo</button>`;
  else if (OFF.sincronizando) html = `<span>⏳ Enviando pedidos feitos offline…</span>`;
  else if (fila.length) html = `<span>⏳ <a style="cursor:pointer;text-decoration:underline" onclick="go('${np ? 'pedidos' : 'agenda'}')">${rot} feito(s) offline</a> aguardando envio${comErro ? ` — <b style="color:var(--bad)">${comErro} recusado(s), abra para corrigir</b>` : ''}.</span><span style="flex:1"></span><button class="btn sm pri" onclick="sincronizar()">Enviar agora</button>`;
  el.innerHTML = html; el.style.display = html ? 'flex' : 'none';
  el.style.background = !OFF.online ? 'var(--warn-soft)' : comErro ? 'var(--bad-soft)' : 'var(--pri-soft)';
}

/* ---------- Detalhe de um pedido que ainda está no aparelho ---------- */
function verPedidoOffline(p) {
  const c = byId('clientes', p.clienteId) || {};
  openModal(`<h2>Pedido aguardando envio <span class="badge b-warn">offline</span></h2>
   <p class="hint">Criado em ${new Date(p.criadoEm).toLocaleString('pt-BR')} neste aparelho. Será enviado automaticamente quando houver internet${p._aprovar ? ' (e aprovado)' : ''}. O número do pedido é gerado pelo servidor no envio.</p>
   ${p._erro ? `<div class="card" style="border-color:var(--bad);background:var(--bad-soft);padding:10px 12px;margin-bottom:10px"><b>O servidor recusou este pedido:</b> ${esc(p._erro)}<br><span class="hint">Corrija com “Editar” ou exclua.</span></div>` : ''}
   <p><b>${esc(c.razao || 'Cliente')}</b> <span class="muted">${esc(c.cidade || '')}</span></p>
   ${tabela([['Produto', i => esc((byId('produtos', i.produtoId) || {}).nome)], ['Qtd', i => num(i.qtd), 'num'], ['Preço', i => brl(i.preco), 'num'], ['Subtotal', i => brl(Regras.subtotalItem(i)), 'num']], p.itens)}
   <div class="totals" style="margin-top:10px"><div class="g"><span>Total</span><span>${brl(totalPedido(p))}</span></div></div>
   ${p.obs ? `<p class="hint">Obs.: ${esc(p.obs)}</p>` : ''}
   <div class="actions"><button class="btn danger" onclick="excluirOffline('${p.id}')">Excluir</button><span style="flex:1"></span>
    <button class="btn" onclick="editarPedido('${p.id}')">Editar</button>${OFF.online ? `<button class="btn" onclick="closeModal();sincronizar()">Enviar agora</button>` : ''}<button class="btn pri" onclick="closeModal()">Fechar</button></div>`, true);
}

/* ---------- App instalável ---------- */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => { }));
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); OFF.instalar = e; const b = document.getElementById('btnInstalar'); if (b) b.style.display = ''; });
async function instalarApp() {
  if (!OFF.instalar) return;
  OFF.instalar.prompt(); await OFF.instalar.userChoice.catch(() => { }); OFF.instalar = null;
  const b = document.getElementById('btnInstalar'); if (b) b.style.display = 'none';
}
