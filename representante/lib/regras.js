/* RepCRM — regras de negócio compartilhadas entre o servidor (Node) e o navegador. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Regras = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Pedido: Orçamento → Enviado (à representada) → Faturado (pela representada) → Entregue  |  Cancelado
  const STATUS = ['Orçamento', 'Enviado', 'Faturado', 'Entregue', 'Cancelado'];
  const FATURADOS = ['Faturado', 'Entregue']; // geram comissão
  const ETAPAS = ['Prospecção', 'Qualificação', 'Proposta', 'Negociação', 'Ganha', 'Perdida'];
  const PROB = { 'Prospecção': 10, 'Qualificação': 25, 'Proposta': 50, 'Negociação': 75, 'Ganha': 100, 'Perdida': 0 };
  const TIPOS = ['Ligação', 'WhatsApp', 'Visita', 'E-mail', 'Reunião', 'Tarefa'];
  const STATUS_CLIENTE = ['Prospect', 'Ativo', 'Inativo'];

  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const n = v => Number(v) || 0;
  // Datas no horário LOCAL (no servidor: TZ=America/Sao_Paulo); toISOString() daria a data em UTC.
  const ymd = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const hoje = () => ymd(new Date());
  const addDays = (d, k) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + k); return ymd(x); };
  const addMeses = (mes, k) => { const [a, m] = mes.split('-').map(Number); const x = new Date(a, m - 1 + k, 1); return ymd(x).slice(0, 7); };
  const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
  const find = (db, col, id) => (db[col] || []).find(x => x.id === id);

  /* ---- Valores do pedido ----
     Mercadoria = Σ qtd × preço × (1 − desc. item) × (1 − desc. geral). IPI é somado por fora.
     A comissão é calculada sobre a mercadoria SEM IPI (prática usual), com o % de cada item. */
  const liqItem = i => n(i.qtd) * n(i.preco) * (1 - n(i.desc) / 100);
  function totais(ped) {
    const f = 1 - n(ped.descontoGeral) / 100;
    let merc = 0, ipi = 0, com = 0;
    for (const i of ped.itens || []) { const v = liqItem(i) * f; merc += v; ipi += v * n(i.ipi) / 100; com += v * n(i.comissao) / 100; }
    return { mercadoria: r2(merc), ipi: r2(ipi), total: r2(merc + ipi), comissao: r2(com), perc: merc ? r2(com / merc * 100) : 0 };
  }
  /** Comissão sobre o que foi faturado: se a representada faturou valor diferente (corte, falta), é proporcional. */
  function comissaoFaturada(ped) {
    const t = totais(ped);
    const base = n(ped.valorFaturado) > 0 ? n(ped.valorFaturado) : t.mercadoria;
    return t.mercadoria > 0 ? r2(t.comissao * base / t.mercadoria) : 0;
  }
  const valorVenda = ped => n(ped.valorFaturado) > 0 ? r2(ped.valorFaturado) : totais(ped).mercadoria;
  /** Prazos da condição de pagamento: "28/35/42" → [28,35,42]; "À vista" → [0]. */
  const prazos = cond => { const d = String(cond || '').split(/[^0-9]+/).filter(Boolean).map(Number); return d.length ? d : [0]; };
  /**
   * Parcelas de comissão de um pedido faturado.
   *  - base "Faturamento": parcela única, paga X dias após o faturamento.
   *  - base "Pagamento" (liquidez): uma parcela por vencimento do cliente, paga X dias após cada vencimento.
   */
  function parcelasComissao(ped, rep) {
    const valor = comissaoFaturada(ped), df = ped.dataFaturamento || hoje(), lag = n(rep && rep.diasComissao);
    const dias = rep && rep.baseComissao === 'Pagamento' ? prazos(ped.condicao) : [0];
    const p = r2(valor / dias.length);
    return dias.map((d, i) => ({ n: i + 1, venc: addDays(df, d + lag), valor: i === dias.length - 1 ? r2(valor - p * (dias.length - 1)) : p, recebida: false, recebidaEm: '', valorRecebido: 0 }));
  }
  /** Todas as parcelas de comissão, achatadas, com referência ao pedido. */
  function parcelas(db) {
    const out = [];
    for (const p of db.pedidos || []) for (const c of p.comissoes || []) out.push({ ...c, pedidoId: p.id, numero: p.numero, clienteId: p.clienteId, representadaId: p.representadaId });
    return out;
  }
  const situacaoParcela = c => c.recebida ? 'Recebida' : (c.venc < hoje() ? 'Atrasada' : 'A receber');
  const faturado = p => FATURADOS.includes(p.status);

  return { STATUS, FATURADOS, ETAPAS, PROB, TIPOS, STATUS_CLIENTE, r2, hoje, addDays, addMeses, diasEntre, find, ymd,
    liqItem, totais, comissaoFaturada, valorVenda, prazos, parcelasComissao, parcelas, situacaoParcela, faturado };
});
