/* DistribPro — leitura de produtos, preços e estoque do Mercos (API v1) para o catálogo público.
 *
 * Variáveis de ambiente:
 *   MERCOS_APPLICATION_TOKEN  token da aplicação (fornecido pelo Mercos ao integrador)
 *   MERCOS_COMPANY_TOKEN      token da empresa no Mercos
 *   MERCOS_AMBIENTE           producao (padrão) ou sandbox
 *   MERCOS_URL                endereço da API (opcional; substitui o do ambiente)
 *   MERCOS_TABELA_ID          id da tabela de preço do Mercos a usar no catálogo (opcional; padrão: preço de tabela do produto)
 *   MERCOS_INTERVALO_MIN      minutos entre as atualizações (padrão 5)
 *
 * Só lê dados: nada é gravado no Mercos.
 * Sincronização incremental pelo parâmetro alterado_apos: a API devolve um lote por vez e avisa,
 * por um cabeçalho "...LIMITOU_REGISTROS", quando há mais registros; o próximo lote começa na última alteração recebida.
 * HTTP 429 (limite de requisições) → espera o tempo pedido em "tempo_ate_permitir_request" e tenta de novo.
 */
'use strict';

const URLS = { producao: 'https://app.mercos.com/api', sandbox: 'https://sandbox.mercos.com/api' };
const cfg = () => ({
  app: process.env.MERCOS_APPLICATION_TOKEN || '', emp: process.env.MERCOS_COMPANY_TOKEN || '',
  url: (process.env.MERCOS_URL || URLS[process.env.MERCOS_AMBIENTE === 'sandbox' ? 'sandbox' : 'producao']).replace(/\/+$/, ''),
  tabela: process.env.MERCOS_TABELA_ID ? Number(process.env.MERCOS_TABELA_ID) : null,
  intervalo: Math.max(1, Number(process.env.MERCOS_INTERVALO_MIN) || 5),
});
const ativo = () => { const c = cfg(); return !!(c.app && c.emp); };

const estado = { produtos: new Map(), precos: new Map(), ultimaSync: null, erro: '', marcas: {}, rodando: false };
const espera = ms => new Promise(ok => setTimeout(ok, ms));
const dataMercos = d => d.replace('T', ' ').slice(0, 19); // "AAAA-MM-DD HH:MM:SS"

async function chamar(caminho, params) {
  const c = cfg(); const u = new URL(c.url + caminho); Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const r = await fetch(u, { headers: { ApplicationToken: c.app, CompanyToken: c.emp, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30e3) });
    if (r.status === 429) { // limite de requisições: espera o tempo indicado
      let s = 5; try { s = Number((await r.json()).tempo_ate_permitir_request) || 5; } catch { }
      await espera(Math.min(s, 120) * 1000); continue;
    }
    if (r.status === 401 || r.status === 403) throw new Error('Mercos recusou os tokens (verifique MERCOS_APPLICATION_TOKEN e MERCOS_COMPANY_TOKEN)');
    if (!r.ok) throw new Error(`Mercos respondeu HTTP ${r.status} em ${caminho}`);
    const limitou = [...r.headers].some(([k, v]) => /limitou[_-]?registros/i.test(k) && String(v) === '1');
    const lista = await r.json();
    if (!Array.isArray(lista)) throw new Error(`Resposta inesperada do Mercos em ${caminho}`);
    return { lista, limitou };
  }
  throw new Error('Mercos: limite de requisições excedido várias vezes seguidas');
}
/** Busca tudo o que mudou desde a última marca, lote a lote. */
async function buscarAlterados(caminho, chave, aplicar) {
  let desde = estado.marcas[chave] || '2000-01-01 00:00:00';
  for (let i = 0; i < 1000; i++) {
    const { lista, limitou } = await chamar(caminho, { alterado_apos: desde });
    lista.forEach(aplicar);
    const ult = lista.reduce((m, x) => (x.ultima_alteracao && x.ultima_alteracao > m ? x.ultima_alteracao : m), desde);
    if (!limitou || !lista.length || ult === desde) { estado.marcas[chave] = ult; return; }
    desde = ult;
  }
}

async function sincronizar() {
  if (!ativo() || estado.rodando) return;
  estado.rodando = true;
  try {
    await buscarAlterados('/v1/produtos', 'produtos', p => {
      if (p.excluido) estado.produtos.delete(p.id); else estado.produtos.set(p.id, p);
    });
    const tab = cfg().tabela;
    if (tab) await buscarAlterados('/v1/produtos_tabela_preco', 'precos', x => {
      if (Number(x.tabela_id) !== tab) return;
      if (x.excluido) estado.precos.delete(x.produto_id); else estado.precos.set(x.produto_id, Number(x.preco));
    });
    estado.ultimaSync = new Date().toISOString(); estado.erro = '';
  } catch (e) {
    estado.erro = e.message; console.error('[Mercos] ' + e.message);
  } finally { estado.rodando = false; }
}
let timer = null;
function iniciar() {
  if (!ativo() || timer) return;
  console.log(`Mercos: lendo produtos, preços e estoque a cada ${cfg().intervalo} min (${cfg().url}).`);
  sincronizar(); timer = setInterval(sincronizar, cfg().intervalo * 60e3); timer.unref();
}

/** Produtos do Mercos no formato usado pelo catálogo. */
function produtos() {
  return [...estado.produtos.values()].map(p => {
    const preco = estado.precos.has(p.id) ? estado.precos.get(p.id) : Number(p.preco_tabela);
    const est = p.saldo_estoque === null || p.saldo_estoque === undefined || p.saldo_estoque === '' ? null : Number(p.saldo_estoque);
    return { id: String(p.id), codigo: String(p.codigo ?? '').trim(), nome: p.nome || '', unidade: p.unidade || 'UN', ativo: p.ativo !== false,
      preco: Number.isFinite(preco) ? preco : 0, estoque: Number.isFinite(est) ? est : null, multiplo: Number(p.multiplo) || null };
  });
}
const situacao = () => ({ ativo: ativo(), ultimaSync: estado.ultimaSync, erro: estado.erro, produtos: estado.produtos.size, url: cfg().url, tabela: cfg().tabela });

module.exports = { ativo, iniciar, sincronizar, produtos, situacao };
