/* Regras de negócio compartilhadas entre servidor (Node) e navegador. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Regras = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const STATUS = ['Orçamento', 'Aprovado', 'Em separação', 'Faturado', 'Entregue', 'Cancelado'];
  const BAIXA = ['Faturado', 'Entregue']; // status em que o estoque já foi baixado
  const ABERTOS = ['Orçamento', 'Aprovado', 'Em separação'];

  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const hoje = () => new Date().toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const find = (db, col, id) => (db[col] || []).find(x => x.id === id);

  function precoCliente(db, p, cli) {
    const t = cli && find(db, 'tabelas', cli.tabelaId);
    const aj = t ? Number(t.ajuste) || 0 : 0;
    return r2(p.preco * (1 + aj / 100));
  }
  const subtotalItem = i => i.qtd * i.preco * (1 - (Number(i.desc) || 0) / 100);
  const totalItens = ped => ped.itens.reduce((s, i) => s + subtotalItem(i), 0);
  const totalPedido = ped => Math.max(0, totalItens(ped) * (1 - (Number(ped.descontoGeral) || 0) / 100) + (Number(ped.frete) || 0));
  const emAberto = (db, clienteId) => db.titulos.filter(t => t.clienteId === clienteId && !t.pago).reduce((s, t) => s + t.valor, 0);
  const vendaValida = p => BAIXA.includes(p.status);

  /* ---- funções que alteram o banco (usadas só no servidor) ---- */
  function movimentar(db, produtoId, tipo, qtd, ref, data, uid) {
    const p = find(db, 'produtos', produtoId); if (!p) return;
    qtd = Number(qtd) || 0;
    if (tipo === 'Ajuste') p.estoque = qtd;
    else p.estoque = (Number(p.estoque) || 0) + (tipo === 'Saída' ? -qtd : qtd);
    db.movimentos.unshift({ id: uid(), data: data || hoje(), produtoId, tipo, qtd, ref, saldo: p.estoque });
  }
  function gerarTitulos(db, ped, uid) {
    const cond = find(db, 'condicoes', ped.condicaoId);
    const dias = String(cond ? cond.parcelas : '0').split(',').map(x => parseInt(x) || 0);
    const tot = r2(totalPedido(ped)); const parc = r2(tot / dias.length);
    dias.forEach((dd, i) => db.titulos.push({
      id: uid(), pedidoId: ped.id, clienteId: ped.clienteId, parcela: `${i + 1}/${dias.length}`, emissao: ped.faturamento || ped.data,
      vencimento: addDays(ped.faturamento || ped.data, dd), valor: i === dias.length - 1 ? r2(tot - parc * (dias.length - 1)) : parc, pago: false, dataPagamento: ''
    }));
  }
  /** Verifica pendências antes de faturar. Retorna lista de avisos. */
  function avisosFaturamento(db, ped) {
    const av = [];
    const falta = ped.itens.filter(i => { const p = find(db, 'produtos', i.produtoId); return p && p.estoque < i.qtd; });
    if (falta.length) av.push('Estoque insuficiente para: ' + falta.map(i => find(db, 'produtos', i.produtoId).nome).join(', '));
    const cli = find(db, 'clientes', ped.clienteId);
    if (cli && cli.limite) {
      const ab = emAberto(db, cli.id);
      if (ab + totalPedido(ped) > cli.limite) av.push(`Limite de crédito excedido (limite R$ ${cli.limite.toFixed(2)}; em aberto R$ ${ab.toFixed(2)})`);
    }
    return av;
  }
  /** Muda o status aplicando baixa/estorno de estoque e títulos. */
  function mudarStatus(db, ped, novo, uid, dataRef) {
    const antes = ped.status; if (antes === novo) return;
    const baixado = BAIXA.includes(antes), vaiBaixar = BAIXA.includes(novo);
    if (!baixado && vaiBaixar) {
      ped.faturamento = dataRef || hoje();
      ped.itens.forEach(i => movimentar(db, i.produtoId, 'Saída', i.qtd, 'Pedido #' + ped.numero, ped.faturamento, uid));
      gerarTitulos(db, ped, uid);
    }
    if (baixado && !vaiBaixar) {
      ped.itens.forEach(i => movimentar(db, i.produtoId, 'Estorno', i.qtd, 'Estorno pedido #' + ped.numero, hoje(), uid));
      db.titulos = db.titulos.filter(t => !(t.pedidoId === ped.id && !t.pago));
      ped.faturamento = '';
    }
    ped.status = novo;
  }

  return { STATUS, BAIXA, ABERTOS, r2, hoje, addDays, find, precoCliente, subtotalItem, totalItens, totalPedido, emAberto, vendaValida,
    movimentar, gerarTitulos, avisosFaturamento, mudarStatus };
});
