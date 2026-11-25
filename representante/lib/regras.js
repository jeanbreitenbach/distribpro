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

  /* ---- CNPJ ---- */
  const digitos = v => String(v || '').replace(/\D/g, '');
  function cnpjValido(v) {
    const d = digitos(v); if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    const dv = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += d[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === +d[12] && dv(13) === +d[13];
  }
  const fmtCNPJ = v => { const d = digitos(v); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : String(v || '').trim(); };
  const fmtFone = v => { let d = digitos(v); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return String(v || '').trim(); };
  const celular = v => /^\d{2}9\d{8}$/.test(digitos(v).replace(/^55(?=\d{11}$)/, ''));
  /** Lê o texto da consulta (BrasilAPI ou ReceitaWS). Aceita o JSON puro ou o texto copiado do visualizador do navegador. */
  function lerConsultaCNPJ(entrada) {
    let o = entrada;
    if (typeof entrada === 'string') {
      const t = entrada.trim(), a = t.indexOf('{'), b = t.lastIndexOf('}');
      try { o = JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t); }
      catch {
        o = {}; // texto copiado do visualizador de JSON: "chave  valor" ou "chave: valor" por linha
        const chaves = ['cnpj', 'razao_social', 'nome_fantasia', 'descricao_tipo_de_logradouro', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf', 'cep', 'ddd_telefone_1', 'ddd_telefone_2',
          'email', 'cnae_fiscal_descricao', 'descricao_situacao_cadastral', 'data_inicio_atividade', 'nome_socio', 'qualificacao_socio', 'nome', 'fantasia', 'telefone', 'situacao', 'abertura', 'text'];
        for (const k of chaves) {
          const m = t.match(new RegExp('(?:^|[\\s{,"\'])' + k + '["\']?\\s*[:\\t=]\\s*"?([^"\\n\\r]*)', 'm'));
          if (m && !(k in o)) o[k] = m[1].replace(/[",]+\s*$/, '').trim();
        }
        if (o.nome_socio) o.qsa = [{ nome_socio: o.nome_socio, qualificacao_socio: o.qualificacao_socio }];
        if (o.text && !o.cnae_fiscal_descricao) o.atividade_principal = [{ text: o.text }];
      }
    }
    if (!o || typeof o !== 'object') return null;
    const v = k => (o[k] == null || o[k] === 'null' ? '' : String(o[k]).trim());
    const razao = v('razao_social') || v('nome');
    if (!razao) return null;
    const fones = [v('ddd_telefone_1'), v('ddd_telefone_2'), ...v('telefone').split('/')].map(x => x.trim()).filter(x => digitos(x).length >= 10).map(fmtFone);
    const cel = fones.find(celular), fixo = fones.find(f => !celular(f)) || fones[0] || '';
    const socio = (Array.isArray(o.qsa) && o.qsa[0]) || {};
    const tipo = v('descricao_tipo_de_logradouro'), rua = v('logradouro');
    const cepD = digitos(v('cep'));
    const titulo = s => s.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\s(De|Da|Do|Das|Dos|E)\s/g, m => m.toLowerCase());
    return {
      razao, fantasia: v('nome_fantasia') || v('fantasia'), cnpj: fmtCNPJ(v('cnpj')),
      logradouro: [tipo && !rua.toUpperCase().startsWith(tipo.toUpperCase()) ? tipo : '', rua].filter(Boolean).join(' ') + (v('complemento') ? ' - ' + v('complemento') : ''),
      numero: v('numero'), bairro: v('bairro'), cidade: v('municipio'), uf: v('uf').toUpperCase().slice(0, 2), cep: cepD.length === 8 ? cepD.replace(/(\d{5})(\d{3})/, '$1-$2') : v('cep'),
      telefone: fixo, whatsapp: cel || '', email: v('email').toLowerCase(),
      segmento: v('cnae_fiscal_descricao') || (Array.isArray(o.atividade_principal) && o.atividade_principal[0] ? String(o.atividade_principal[0].text || '') : ''),
      contato: socio.nome_socio || socio.nome ? titulo(String(socio.nome_socio || socio.nome)) : '', cargo: String(socio.qualificacao_socio || socio.qual || '').replace(/^\d+-/, ''),
      situacao: v('descricao_situacao_cadastral') || v('situacao'), abertura: v('data_inicio_atividade') || v('abertura'),
    };
  }

  return { digitos, cnpjValido, fmtCNPJ, fmtFone, lerConsultaCNPJ, STATUS, FATURADOS, ETAPAS, PROB, TIPOS, STATUS_CLIENTE, r2, hoje, addDays, addMeses, diasEntre, find, ymd,
    liqItem, totais, comissaoFaturada, valorVenda, prazos, parcelasComissao, parcelas, situacaoParcela, faturado };
});
