/* RepCRM — "servidor" dentro da página publicada no claude.ai.
 * As regras são as mesmas do server.js (trechos copiados pelo build.py); os dados ficam no banco da página (capability db).
 * Cada registro é um documento "<coleção>/<id>"; os seus dados gerais ficam em "ajustes/geral". */
const Backend = (() => {
  'use strict';
  const R = Regras;
  const COLS = ['representadas', 'clientes', 'produtos', 'oportunidades', 'pedidos', 'atividades'];
  const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
  const hashSenha = () => { throw new Error('sem usuários nesta versão'); };

  /*@@SEED@@*/

  let db = baseVazia(); db.usuarios = [];
  // Carteiras separadas: cada uma é um CRM completo, com os dados em "carteiras/<id>/..."
  const CARTEIRAS = [{ id: 'mayrink', nome: 'Mayrink' }, { id: 'trac', nome: 'TRAC' }];
  let carteira = CARTEIRAS[0], prefixo = 'carteiras/mayrink/', geracao = 0, cancelar = [];
  let store = null, aoMudar = () => { };
  const confirmado = new Map(); // "col/id" → JSON (chaves ordenadas) do que está gravado no banco
  // JSON com chaves em ordem: o banco pode devolver os campos noutra ordem, e isso não é alteração
  const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, c) => (o[c] = x[c], o), {}) : x);
  const CFG = 'ajustes/geral';

  /** Volta ao último estado gravado (operação recusada ou falhou no meio). */
  function carregar() {
    const novo = baseVazia(); novo.usuarios = [];
    for (const [k, j] of confirmado) {
      if (k === CFG) { const c = JSON.parse(j); novo.config = { ...novo.config, ...(c.config || {}) }; novo.seq = c.seq || novo.seq; continue; }
      const [c] = k.split('/'); if (novo[c]) novo[c].push(JSON.parse(j));
    }
    db = novo;
  }
  function substituirTudo(novo) { const u = db.usuarios; db = novo; COLS.forEach(c => db[c] = db[c] || []); db.seq = db.seq || { pedido: 0 }; db.usuarios = u || []; }

  async function comRetentativa(fn) {
    for (let t = 0; ; t++) {
      try { return await fn(); }
      catch (e) {
        if (t < 4 && e && ['unavailable', 'resource_exhausted'].includes(e.code)) { await new Promise(r => setTimeout(r, 400 * 2 ** t + Math.random() * 300)); continue; }
        if (e && e.code === 'quota_exceeded') throw new Erro(400, 'O espaço do banco desta página acabou. Exclua registros antigos (ex.: produtos inativos) e tente de novo.');
        if (e && e.code === 'invalid_argument') throw new Erro(400, 'Você não tem permissão para alterar os dados desta página (acesso só de leitura).');
        throw new Erro(503, 'Não foi possível salvar agora. Verifique a internet e tente de novo.');
      }
    }
  }
  /** Grava só o que mudou desde o último estado confirmado, até 6 gravações por vez. */
  async function persistir() {
    const ops = [], vivos = new Set(), pre = prefixo, P = k => pre + k;
    for (const c of COLS) for (const o of db[c]) {
      const k = c + '/' + o.id, j = canon(o); vivos.add(k);
      if (confirmado.get(k) !== j) ops.push(async () => { await comRetentativa(() => store.doc(P(k)).set(JSON.parse(j))); confirmado.set(k, j); });
    }
    const jc = canon({ config: db.config, seq: db.seq }); vivos.add(CFG);
    if (confirmado.get(CFG) !== jc) ops.push(async () => { await comRetentativa(() => store.doc(P(CFG)).set(JSON.parse(jc))); confirmado.set(CFG, jc); });
    for (const k of [...confirmado.keys()]) if (!vivos.has(k)) ops.push(async () => { await comRetentativa(() => store.doc(P(k)).delete()); confirmado.delete(k); });
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(6, ops.length) }, async () => { while (i < ops.length) await ops[i++](); }));
  }

  /*@@REGRAS@@*/

  const rotas = [];
  function rota(m, p, fn, opts = {}) { rotas.push({ m, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, ...opts }); }
  rota('GET', '/api/data', () => null);
  rota('PUT', '/api/crud/:col', (req, b, u, p) => salvarCadastro(u, p.col, b), { grava: true });
  rota('DELETE', '/api/crud/:col/:id', (req, b, u, p) => excluirCadastro(u, p.col, p.id), { grava: true });

  /*@@ROTAS@@*/

  delete CAMPOS.usuarios;
  let fila = Promise.resolve(); // uma operação por vez, como no servidor
  function chamar(metodo, url, corpo) {
    const r = rotas.find(x => x.m === metodo && x.re.test(url));
    const exec = async () => {
      if (!r) throw new Erro(404, 'Rota não encontrada');
      if (r.grava && !store) throw new Erro(503, 'O banco desta página não está disponível agora.');
      db.seq.pedido = Math.max(Number(db.seq.pedido) || 0, 0, ...db.pedidos.map(p => p.numero || 0)); // outro aparelho pode ter criado pedidos
      try {
        const u = { nome: db.config.nome || 'Representante' };
        const out = await r.fn({}, JSON.parse(JSON.stringify(corpo || {})), u, url.match(r.re).groups || {});
        if (r.grava) await persistir();
        return { ok: true, ...(out || {}) };
      } catch (e) {
        if (r.grava) carregar();
        if (!(e instanceof Erro)) console.error(e);
        throw Object.assign(new Error(e instanceof Erro ? e.message : 'Erro inesperado: ' + (e && e.message)), { status: e.status || 500 });
      } finally { aoMudar(); }
    };
    const p = fila.then(exec, exec); fila = p.catch(() => { }); return p;
  }

  const configPadrao = () => ({ ...baseVazia().config, empresa: carteira.nome });
  /** Assina as coleções da carteira atual (e para de ouvir a anterior). */
  function conectar() {
    cancelar.forEach(f => f()); cancelar = [];
    const g = ++geracao; confirmado.clear();
    db = baseVazia(); db.usuarios = []; db.config = configPadrao();
    const pendentes = new Set([...COLS, CFG]);
    let pronto; const primeira = new Promise(r => pronto = r);
    const marcar = k => { if (pendentes.delete(k) && !pendentes.size) pronto(); };
    const ouvir = c => store.collection(prefixo + c).onSnapshot(snap => {
      if (g !== geracao) return; // resposta atrasada da carteira anterior
      const vistos = new Set();
      db[c] = snap.docs.filter(d => d.exists).map(d => { const o = JSON.parse(JSON.stringify(d.data())); confirmado.set(c + '/' + d.id, canon(o)); vistos.add(c + '/' + d.id); return o; });
      for (const k of [...confirmado.keys()]) if (k.startsWith(c + '/') && !vistos.has(k)) confirmado.delete(k);
      marcar(c); if (!pendentes.size) aoMudar();
    }, e => { console.error('db', c, e); marcar(c); });
    COLS.forEach(c => cancelar.push(ouvir(c)));
    cancelar.push(store.doc(prefixo + CFG).onSnapshot(d => {
      if (g !== geracao) return;
      if (d.exists) { const v = JSON.parse(JSON.stringify(d.data())); confirmado.set(CFG, canon(v)); db.config = { ...configPadrao(), ...(v.config || {}) }; db.seq = v.seq || db.seq; }
      marcar(CFG); if (!pendentes.size) aoMudar();
    }, e => { console.error('db config', e); marcar(CFG); }));
    const tempo = new Promise(r => setTimeout(() => r('lento'), 10000));
    return Promise.race([primeira, tempo]).then(x => ({ ok: true, lento: x === 'lento' }));
  }
  /** Conecta ao banco da página e acompanha as mudanças (de outro aparelho também). */
  async function iniciar(onChange, idCarteira) {
    aoMudar = onChange;
    store = await claude.use('db');
    if (!store) return { ok: false };
    carteira = CARTEIRAS.find(c => c.id === idCarteira) || CARTEIRAS[0]; prefixo = 'carteiras/' + carteira.id + '/';
    return conectar();
  }
  /** Troca de carteira depois que as gravações em andamento terminarem. */
  function trocar(id) {
    const c = CARTEIRAS.find(x => x.id === id); if (!c) return Promise.resolve({ ok: false });
    const p = fila.then(() => { carteira = c; prefixo = 'carteiras/' + c.id + '/'; return conectar(); });
    fila = p.catch(() => { }); return p;
  }

  return { chamar, iniciar, trocar, CARTEIRAS, carteira: () => carteira, dados: () => Object.assign(db, { me: { nome: db.config.nome || 'Representante' } }), baseVazia };
})();
