/* DistribPro — catálogo interativo público (/catalogo).
 * Dados fixos (fotos, nutrição, WhatsApp) em lib/catalogo.js; preço e estoque vêm do DistribPro em /api/catalogo. */
'use strict';
(() => {
  const { CONFIG, SECOES, PRODUTOS } = window.Catalogo;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const porCodigo = Object.fromEntries(PRODUTOS.map(p => [p.codigo, p]));
  const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };

  let precos = {};          // codigo -> { preco, estoque, situacao, unidade } (vindo do DistribPro)
  let carrinho = ler('cat_carrinho', {}); // codigo -> qtd
  let cliente = ler('cat_cliente', {});
  let filtro = { secao: '', q: '' };
  Object.keys(carrinho).forEach(c => { if (!porCodigo[c] || !(carrinho[c] > 0)) delete carrinho[c]; });

  /* ---------- WhatsApp ---------- */
  const linkWhats = txt => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(txt)}`;
  const abrirWhats = txt => { window.open(linkWhats(txt), '_blank', 'noopener'); };
  const saudacao = () => `Olá, ${CONFIG.atendente}!`;
  function linhaItem(p, qtd, comPreco) {
    const pr = precos[p.codigo]; let s = `• ${qtd}x ${p.nomeCompleto} [${p.codigo}]`;
    if (comPreco && pr && pr.preco) s += ` — ${brl(pr.preco)} = ${brl(pr.preco * qtd)}`;
    return s;
  }
  function dadosCliente() {
    const c = cliente, l = [];
    if (c.nome) l.push(`Cliente: ${c.nome}`); if (c.doc) l.push(`CNPJ/CPF: ${c.doc}`);
    if (c.cidade) l.push(`Cidade: ${c.cidade}`); if (c.telefone) l.push(`Telefone: ${c.telefone}`);
    if (c.obs) l.push(`Obs.: ${c.obs}`);
    return l.length ? '\n\n' + l.join('\n') : '';
  }
  function msgItens(tipo, itens) {
    const pedido = tipo === 'pedido';
    let t = `${saudacao()} ${pedido ? 'Quero fazer um *pedido*' : 'Gostaria de um *orçamento*'} pelo catálogo:\n\n` + itens.map(([p, q]) => linhaItem(p, q, pedido)).join('\n');
    if (pedido) {
      const tot = totalCarrinho(itens);
      if (tot.valor > 0) t += `\n\n*Total estimado: ${brl(tot.valor)}*` + (tot.semPreco ? `\n(${tot.semPreco} item(ns) com preço a confirmar)` : '');
    } else t += '\n\nPode me passar preços, disponibilidade e prazo de entrega?';
    return t + dadosCliente();
  }

  /* ---------- preço e estoque ---------- */
  async function carregarPrecos() {
    try {
      const r = await fetch('/api/catalogo', { cache: 'no-store' }); if (!r.ok) throw new Error();
      const j = await r.json(); precos = Object.fromEntries(j.itens.map(i => [i.codigo, i]));
      const h = new Date(j.atualizado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      $('#status').textContent = j.itens.length ? `Preços e estoque atualizados às ${h}.` : `Preços e estoque sob consulta com o ${CONFIG.atendente}.`;
    } catch { $('#status').textContent = `Não foi possível carregar preços e estoque agora. Consulte o ${CONFIG.atendente} pelo WhatsApp.`; }
    desenhar(); if ($('#janelaCarrinho').open) desenharCarrinho();
    const aberto = $('#janelaProduto').dataset.codigo; if ($('#janelaProduto').open && aberto) desenharProduto(aberto, true);
  }
  function seloEstoque(pr) {
    if (!pr || !pr.situacao) return '';
    const cls = pr.situacao === 'Esgotado' ? 'fim' : pr.situacao === 'Disponível' ? 'ok' : 'pouco';
    const txt = pr.estoque !== undefined && pr.situacao !== 'Esgotado' ? `Estoque: ${num(pr.estoque)} ${esc(pr.unidade.toLowerCase())}` : esc(pr.situacao);
    return `<span class="est ${cls}">${txt}</span>`;
  }
  function blocoPreco(p) {
    const pr = precos[p.codigo];
    return pr && pr.preco ? `<span class="preco">${brl(pr.preco)} <small>/${esc(pr.unidade.toLowerCase())}</small></span>` : `<span class="consulta">Preço sob consulta</span>`;
  }

  /* ---------- lista ---------- */
  function desenharSecoes() {
    $('#secoes').innerHTML = [['', 'Todos'], ...SECOES.map(s => [s.id, s.nome])]
      .map(([id, nome]) => `<button type="button" data-secao="${id}" aria-pressed="${filtro.secao === id}">${esc(nome)}</button>`).join('');
  }
  const normal = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function desenhar() {
    const q = normal(filtro.q);
    const html = SECOES.filter(s => !filtro.secao || s.id === filtro.secao).map(s => {
      const itens = PRODUTOS.filter(p => p.secao === s.id && (!q || normal(`${p.nome} ${p.detalhe} ${p.marca} ${p.embalagem} ${p.codigo}`).includes(q)));
      if (!itens.length) return '';
      return `<section class="secao ${s.id === 'tiatania' ? 'ouro' : ''}" id="sec-${s.id}"><h2>${esc(s.nome)}</h2><div class="grade">${itens.map(cartao).join('')}</div></section>`;
    }).join('');
    $('#lista').innerHTML = html || `<p class="vazio">Nenhum produto encontrado para "${esc(filtro.q)}".</p>`;
  }
  function cartao(p) {
    const pr = precos[p.codigo]; const esgotado = pr && pr.situacao === 'Esgotado';
    return `<article class="card">
      <button type="button" class="card-abrir" data-abrir="${p.codigo}" aria-label="Ver detalhes e tabela nutricional de ${esc(p.nome)} ${esc(p.detalhe)} ${esc(p.embalagem)}">
        <img src="${p.imagem}" alt="" loading="lazy" width="360" height="360">
        <span class="selos">${p.selos.map(s => `<span class="selo">${esc(s)}</span>`).join('')}</span>
        <span class="emb">${esc(p.embalagem)}</span>
      </button>
      <div class="card-corpo">
        <h3>${esc(p.nome)}</h3>
        ${p.detalhe ? `<span class="detalhe">${esc(p.detalhe)}</span>` : ''}
        <div class="meta"><span>${esc(p.marca)}</span><span class="peso" title="Peso de cada unidade">${esc(p.unidadePeso)}</span></div>
        <div class="preco-linha">${blocoPreco(p)}${seloEstoque(pr)}</div>
        <div class="card-acoes">
          ${seletor(p.codigo, 1, 'card')}
          <button type="button" class="btn pri" data-add="${p.codigo}" ${esgotado ? 'title="Sem estoque no momento: o atendente confirma a previsão"' : ''}>Adicionar</button>
        </div>
      </div>
    </article>`;
  }
  const seletor = (codigo, v, onde) => `<div class="qtd" data-qtd-de="${codigo}" data-onde="${onde}"><button type="button" data-passo="-1" aria-label="Diminuir">−</button><input type="number" inputmode="numeric" min="1" value="${v}" aria-label="Quantidade"><button type="button" data-passo="1" aria-label="Aumentar">+</button></div>`;
  const qtdDe = el => Math.max(1, Math.floor(Number(el.querySelector('input').value) || 1));

  /* ---------- janela do produto ---------- */
  const VD = { kcal: 2000, carb: 300, acucares: 50, prot: 50, gord: 65, sat: 20, fibra: 25, sodio: 2000 }; // valores diários de referência (RDC 429/2020)
  function tabelaNutricional(n) {
    const linhas = [['Valor energético', 'kcal', 'kcal'], ['Carboidratos', 'carb', 'g'], ['Açúcares totais', 'acucares', 'g', 1], ['Proteínas', 'prot', 'g'],
      ['Gorduras totais', 'gord', 'g'], ['Gorduras saturadas', 'sat', 'g', 1], ['Gorduras trans', 'trans', 'g', 1], ['Fibra alimentar', 'fibra', 'g'], ['Sódio', 'sodio', 'mg']];
    return `<table class="nutri"><caption>Informação nutricional</caption>
      <thead><tr><th>Porção de ${esc(n.porcao)}</th><th>Porção</th><th>%VD*</th></tr></thead>
      <tbody>${linhas.map(([nome, k, un, sub]) => `<tr${sub ? ' class="sub"' : ''}><th scope="row">${nome}</th><td>${num(n[k])} ${un}</td><td>${VD[k] ? Math.round(n[k] / VD[k] * 100) + '%' : '—'}</td></tr>`).join('')}</tbody></table>
      <p class="nota">*Percentual de valores diários fornecidos pela porção.</p>
      ${n.confirmada ? '' : '<p class="ref">Valores de referência para este tipo de produto. Confira a tabela na embalagem.</p>'}`;
  }
  function desenharProduto(codigo, manterQtd) {
    const p = porCodigo[codigo]; if (!p) return;
    const j = $('#janelaProduto'), pr = precos[codigo];
    const qtdAtual = manterQtd && j.querySelector('[data-onde="janela"]') ? qtdDe(j.querySelector('[data-onde="janela"]')) : 1;
    j.dataset.codigo = codigo;
    j.innerHTML = `<div class="j-topo"><h2 id="pTitulo">${esc(p.nome)}</h2><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></div>
      <div class="j-corpo">
        <div class="j-img"><img src="${p.imagem}" alt="Embalagem de ${esc(p.nome)} ${esc(p.embalagem)}" width="360" height="360"></div>
        <div class="j-info">
          ${p.detalhe ? `<span class="detalhe">${esc(p.detalhe)}</span>` : ''}
          <div class="fatos">
            <span class="fato"><b>Marca</b>${esc(p.marca)}</span><span class="fato"><b>Embalagem</b>${esc(p.embalagem)}</span>
            <span class="fato"><b>Cada unidade</b>${esc(p.unidadePeso)}</span><span class="fato"><b>Código</b>${esc(p.codigo)}</span>
          </div>
          <div class="caixa-preco">${blocoPreco(p)}${seloEstoque(pr) || `<span class="consulta">Estoque sob consulta</span>`}</div>
          <div class="acoes-j">
            <div class="add">${seletor(codigo, qtdAtual, 'janela')}<button type="button" class="btn pri" data-add="${codigo}">Adicionar ao carrinho</button></div>
            <button type="button" class="btn whats" data-whats="orcamento">💬 Solicitar orçamento</button>
            <button type="button" class="btn whats" data-whats="pedido">✅ Fazer pedido</button>
            ${pr && pr.preco ? '' : `<button type="button" class="btn sec" data-whats="consulta" style="grid-column:1/-1">Consultar preço e estoque com o ${esc(CONFIG.atendente)}</button>`}
          </div>
          ${tabelaNutricional(p.nutricao)}
          <h3 class="tit">Modo de preparo</h3><p class="texto-p">${esc(p.preparo)}</p>
          <h3 class="tit">Conservação</h3><p class="texto-p">${esc(p.conservacao)}</p>
        </div>
      </div>`;
  }
  function abrirProduto(codigo) {
    if (!porCodigo[codigo]) return;
    desenharProduto(codigo); const j = $('#janelaProduto');
    if (!j.open) j.showModal(); j.scrollTop = 0;
    if (location.hash !== '#p=' + codigo) history.replaceState(null, '', '#p=' + codigo); // link direto para o produto
  }
  $('#janelaProduto').addEventListener('close', () => { if (location.hash.startsWith('#p=')) history.replaceState(null, '', location.pathname + location.search); });

  /* ---------- carrinho ---------- */
  const itensCarrinho = () => Object.entries(carrinho).filter(([c, q]) => porCodigo[c] && q > 0).map(([c, q]) => [porCodigo[c], q]);
  function totalCarrinho(itens = itensCarrinho()) {
    let valor = 0, semPreco = 0;
    for (const [p, q] of itens) { const pr = precos[p.codigo]; if (pr && pr.preco) valor += pr.preco * q; else semPreco++; }
    return { valor, semPreco };
  }
  function salvarCarrinho() {
    gravar('cat_carrinho', carrinho);
    $('#qtdCarrinho').textContent = itensCarrinho().reduce((s, [, q]) => s + q, 0);
  }
  function adicionar(codigo, qtd) {
    carrinho[codigo] = (carrinho[codigo] || 0) + qtd; salvarCarrinho();
    const b = $('#abrirCarrinho'); b.classList.remove('pulo'); void b.offsetWidth; b.classList.add('pulo');
    aviso(`${qtd}x ${porCodigo[codigo].nome} ${porCodigo[codigo].embalagem} no carrinho`);
  }
  function desenharCarrinho() {
    const itens = itensCarrinho(), tot = totalCarrinho(itens), c = cliente;
    $('#janelaCarrinho').innerHTML = `<div class="j-topo"><h2 id="cTitulo">Seu carrinho</h2><button type="button" class="fechar" data-fechar aria-label="Fechar">×</button></div>
      <div class="c-corpo">
        ${itens.length ? itens.map(([p, q]) => {
          const pr = precos[p.codigo]; const falta = pr && pr.estoque !== undefined && q > pr.estoque;
          return `<div class="c-item"><img src="${p.imagem}" alt="">
            <div><div class="nome">${esc(p.nome)}${p.detalhe ? ' — ' + esc(p.detalhe) : ''}</div>
              <div class="sub">${esc(p.embalagem)} · un. ${esc(p.unidadePeso)} · ${pr && pr.preco ? brl(pr.preco) : 'preço sob consulta'}</div>
              ${falta ? `<div class="alerta-est">Estoque atual: ${num(pr.estoque)}. O atendente confirma o restante.</div>` : ''}</div>
            <div class="c-dir">${seletor(p.codigo, q, 'carrinho')}<button type="button" class="remover" data-remover="${p.codigo}">Remover</button></div></div>`;
        }).join('') : '<p class="vazio">Seu carrinho está vazio.<br>Toque em <b>Adicionar</b> nos produtos.</p>'}
        ${itens.length ? `<div class="total"><span>Total estimado</span><span>${tot.valor > 0 ? brl(tot.valor) : 'Sob consulta'}</span></div>
          ${tot.semPreco && tot.valor > 0 ? `<p class="nota">${tot.semPreco} item(ns) com preço a confirmar.</p>` : ''}
          <form class="form" id="formCliente" autocomplete="on">
            <h3>Seus dados</h3>
            <label>Nome ou razão social<input name="nome" value="${esc(c.nome)}" autocomplete="organization"></label>
            <div class="duas"><label>CNPJ ou CPF<input name="doc" value="${esc(c.doc)}" inputmode="numeric"></label>
              <label>Cidade<input name="cidade" value="${esc(c.cidade)}" autocomplete="address-level2"></label></div>
            <label>Telefone<input name="telefone" value="${esc(c.telefone)}" inputmode="tel" autocomplete="tel"></label>
            <label>Observações<textarea name="obs" placeholder="Entrega, forma de pagamento...">${esc(c.obs)}</textarea></label>
          </form>` : ''}
      </div>
      ${itens.length ? `<div class="c-rodape"><div class="lin">
          <button type="button" class="btn whats" data-whats-carrinho="orcamento">💬 Solicitar orçamento</button>
          <button type="button" class="btn whats" data-whats-carrinho="pedido">✅ Enviar pedido</button></div>
          <button type="button" class="btn link" data-limpar>Esvaziar carrinho</button></div>` : ''}`;
  }
  function lerCliente() {
    const f = $('#formCliente'); if (!f) return;
    cliente = Object.fromEntries(['nome', 'doc', 'cidade', 'telefone', 'obs'].map(k => [k, f.elements[k].value.trim()])); gravar('cat_cliente', cliente);
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('button,a'); if (!t) return;
    if (t.dataset.secao !== undefined) { filtro.secao = t.dataset.secao; desenharSecoes(); desenhar(); window.scrollTo({ top: 0 }); return; }
    if (t.dataset.abrir) return abrirProduto(t.dataset.abrir);
    if (t.dataset.passo) {
      const box = t.closest('.qtd'), inp = box.querySelector('input'); const v = Math.max(box.dataset.onde === 'carrinho' ? 0 : 1, (Number(inp.value) || 0) + Number(t.dataset.passo));
      inp.value = v; if (box.dataset.onde === 'carrinho') mudarNoCarrinho(box.dataset.qtdDe, v); return;
    }
    if (t.dataset.add) { const box = t.parentElement.querySelector('.qtd'); adicionar(t.dataset.add, qtdDe(box)); if (box.dataset.onde === 'card') box.querySelector('input').value = 1; return; }
    if (t.dataset.whats) {
      const j = $('#janelaProduto'), p = porCodigo[j.dataset.codigo], q = qtdDe(j.querySelector('[data-onde="janela"]'));
      if (t.dataset.whats === 'consulta') return abrirWhats(`${saudacao()} Pode me informar o preço e o estoque de: ${p.nomeCompleto} [${p.codigo}]?`);
      return abrirWhats(msgItens(t.dataset.whats, [[p, q]]));
    }
    if (t.dataset.whatsCarrinho) {
      lerCliente(); const pedido = t.dataset.whatsCarrinho === 'pedido';
      if (pedido && (!cliente.nome || !cliente.cidade)) { aviso('Para enviar o pedido, informe seu nome e cidade.'); $('#formCliente').elements[cliente.nome ? 'cidade' : 'nome'].focus(); return; }
      abrirWhats(msgItens(t.dataset.whatsCarrinho, itensCarrinho()));
      if (pedido) aviso('Pedido aberto no WhatsApp. É só tocar em enviar.');
      return;
    }
    if (t.dataset.remover) { delete carrinho[t.dataset.remover]; salvarCarrinho(); lerCliente(); desenharCarrinho(); return; }
    if (t.dataset.limpar !== undefined) { if (confirm('Esvaziar o carrinho?')) { carrinho = {}; salvarCarrinho(); desenharCarrinho(); } return; }
    if (t.dataset.fechar !== undefined) { lerCliente(); t.closest('dialog').close(); return; }
  });
  function mudarNoCarrinho(codigo, v) {
    lerCliente(); if (v <= 0) delete carrinho[codigo]; else carrinho[codigo] = v; salvarCarrinho(); desenharCarrinho();
  }
  document.addEventListener('change', e => {
    const box = e.target.closest('.qtd'); if (!box) return;
    if (box.dataset.onde === 'carrinho') mudarNoCarrinho(box.dataset.qtdDe, Math.max(0, Math.floor(Number(e.target.value) || 0)));
    else e.target.value = qtdDe(box);
  });
  document.addEventListener('input', e => { if (e.target.closest('#formCliente')) lerCliente(); });
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', e => { if (e.target === d) { lerCliente(); d.close(); } }); // clique fora fecha
  $('#abrirCarrinho').addEventListener('click', () => { desenharCarrinho(); $('#janelaCarrinho').showModal(); });
  let tBusca; $('#busca').addEventListener('input', e => { clearTimeout(tBusca); tBusca = setTimeout(() => { filtro.q = e.target.value.trim(); desenhar(); }, 120); });
  window.addEventListener('hashchange', () => { const m = location.hash.match(/^#p=(.+)$/); if (m) abrirProduto(decodeURIComponent(m[1])); });

  let tAviso; function aviso(msg) { const a = $('#aviso'); a.textContent = msg; a.classList.add('on'); clearTimeout(tAviso); tAviso = setTimeout(() => a.classList.remove('on'), 2600); }

  /* ---------- início ---------- */
  document.title = CONFIG.titulo;
  $('#whatsFlutuante').href = linkWhats(`${saudacao()} Vim pelo catálogo e gostaria de atendimento.`);
  $('#whatsFlutuanteTxt').textContent = `Falar com o ${CONFIG.atendente}`;
  desenharSecoes(); desenhar(); salvarCarrinho();
  const m = location.hash.match(/^#p=(.+)$/); if (m) abrirProduto(decodeURIComponent(m[1]));
  carregarPrecos(); setInterval(() => { if (!document.hidden) carregarPrecos(); }, 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) carregarPrecos(); });
})();
