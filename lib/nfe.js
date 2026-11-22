/*
 * Emissão de NF-e.
 *
 * Provedores:
 *  - "simulado" (padrão): gera número/chave fictícios, sem valor fiscal. Útil para testar o fluxo.
 *  - "focusnfe": envia para a API da Focus NFe (https://focusnfe.com.br), que assina e transmite à SEFAZ.
 *      Requer conta na Focus NFe com o certificado A1 da empresa cadastrado.
 *      Variáveis de ambiente: NFE_PROVEDOR=focusnfe, FOCUS_TOKEN=<token>, FOCUS_AMBIENTE=homologacao|producao
 *
 * IMPORTANTE: as regras tributárias (CFOP, CST/CSOSN, NCM, ICMS-ST etc.) variam por empresa e produto.
 * Os valores abaixo são um ponto de partida para empresas do Simples Nacional em venda dentro do estado
 * e DEVEM ser validados pelo contador antes de usar em produção.
 */
const R = require('./regras');

const provedor = () => process.env.NFE_PROVEDOR || 'simulado';
const so = s => String(s || '').replace(/\D/g, '');

function montarNota(db, ped) {
  const e = db.empresa, c = R.find(db, 'clientes', ped.clienteId) || {};
  const fatorDesc = 1 - (Number(ped.descontoGeral) || 0) / 100;
  const doc = so(c.cnpj);
  const interestadual = (c.uf || e.uf) !== e.uf;
  return {
    natureza_operacao: 'Venda de mercadoria',
    data_emissao: new Date().toISOString(),
    tipo_documento: 1, finalidade_emissao: 1, consumidor_final: 0, presenca_comprador: 9,
    local_destino: interestadual ? 2 : 1,
    cnpj_emitente: so(e.cnpj),
    nome_destinatario: c.razao,
    [doc.length === 11 ? 'cpf_destinatario' : 'cnpj_destinatario']: doc,
    inscricao_estadual_destinatario: so(c.ie) || undefined,
    indicador_inscricao_estadual_destinatario: so(c.ie) ? 1 : 9,
    logradouro_destinatario: c.logradouro, numero_destinatario: c.numero || 'S/N', bairro_destinatario: c.bairro,
    municipio_destinatario: c.cidade, uf_destinatario: c.uf, cep_destinatario: so(c.cep), telefone_destinatario: so(c.telefone),
    valor_frete: R.r2(ped.frete), modalidade_frete: ped.frete ? 0 : 9,
    informacoes_adicionais_contribuinte: `Pedido #${ped.numero}` + (ped.obs ? ' - ' + ped.obs : ''),
    items: ped.itens.map((i, k) => {
      const p = R.find(db, 'produtos', i.produtoId) || {};
      const bruto = R.r2(i.qtd * i.preco);
      const liquido = R.r2(R.subtotalItem(i) * fatorDesc);
      return {
        numero_item: k + 1, codigo_produto: p.codigo, descricao: p.nome, codigo_ncm: so(p.ncm),
        cfop: interestadual ? '6102' : '5102',
        unidade_comercial: p.unidade, quantidade_comercial: i.qtd, valor_unitario_comercial: i.preco,
        unidade_tributavel: p.unidade, quantidade_tributavel: i.qtd, valor_unitario_tributavel: i.preco,
        valor_bruto: bruto, valor_desconto: R.r2(bruto - liquido) || undefined,
        icms_origem: 0, icms_situacao_tributaria: '102', // Simples Nacional sem permissão de crédito
        pis_situacao_tributaria: '07', cofins_situacao_tributaria: '07',
      };
    }),
  };
}

function validar(db, ped) {
  const erros = [];
  const e = db.empresa, c = R.find(db, 'clientes', ped.clienteId) || {};
  if (!R.BAIXA.includes(ped.status)) erros.push('O pedido precisa estar Faturado.');
  if (so(e.cnpj).length !== 14) erros.push('CNPJ da empresa inválido (Configurações).');
  if (![11, 14].includes(so(c.cnpj).length)) erros.push('CNPJ/CPF do cliente inválido.');
  for (const k of ['logradouro', 'bairro', 'cidade', 'uf', 'cep']) if (!c[k]) erros.push(`Endereço do cliente incompleto (${k}).`);
  ped.itens.forEach(i => { const p = R.find(db, 'produtos', i.produtoId) || {}; if (so(p.ncm).length !== 8) erros.push(`NCM inválido no produto ${p.nome}.`); });
  return erros;
}

async function focus(method, path, body) {
  const base = process.env.FOCUS_AMBIENTE === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';
  const res = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from((process.env.FOCUS_TOKEN || '') + ':').toString('base64') },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text(); let json; try { json = JSON.parse(txt); } catch { json = { mensagem: txt }; }
  if (!res.ok && res.status !== 422) throw new Error(json.mensagem || `Focus NFe respondeu ${res.status}`);
  return json;
}

/** Emite (ou consulta, se já enviada) a NF-e do pedido. Atualiza ped.nfe. */
async function emitir(db, ped) {
  const erros = validar(db, ped);
  if (erros.length) throw new Error(erros.join('\n'));
  if (ped.nfe && ped.nfe.status === 'autorizada') return ped.nfe;

  if (provedor() === 'simulado') {
    const numero = ++db.seq.nfe;
    const chave = ('35' + new Date().toISOString().slice(2, 7).replace('-', '') + so(db.empresa.cnpj) + '55001' + String(numero).padStart(9, '0') + '1' + String(Math.random()).slice(2, 11)).slice(0, 44);
    ped.nfe = { status: 'autorizada', simulada: true, numero, serie: 1, chave, emitidaEm: new Date().toISOString(), mensagem: 'Simulação — sem valor fiscal' };
    return ped.nfe;
  }
  if (!process.env.FOCUS_TOKEN) throw new Error('FOCUS_TOKEN não configurado.');
  const ref = 'ped' + ped.numero;
  let r;
  if (!ped.nfe) r = await focus('POST', `/v2/nfe?ref=${ref}`, montarNota(db, ped));
  else r = await focus('GET', `/v2/nfe/${ref}`);
  if (r.codigo && r.codigo !== 'already_processed' && !r.status) throw new Error(r.mensagem || r.codigo);
  ped.nfe = {
    status: r.status === 'autorizado' ? 'autorizada' : r.status === 'erro_autorizacao' ? 'rejeitada' : 'processando',
    ref, numero: r.numero, serie: r.serie, chave: r.chave_nfe, mensagem: r.mensagem_sefaz || r.mensagem || r.status,
    danfe: r.caminho_danfe ? (process.env.FOCUS_AMBIENTE === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br') + r.caminho_danfe : '',
    emitidaEm: new Date().toISOString(),
  };
  return ped.nfe;
}

module.exports = { emitir, validar, montarNota, provedor };
