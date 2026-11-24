/* DistribPro — dados do catálogo interativo (página /catalogo).
 * Usado pelo servidor (preços e estoque) e pelo navegador (servido em /catalogo-dados.js).
 *
 * COMO EDITAR
 * - CONFIG.whatsapp: número que recebe orçamentos e pedidos (55 + DDD + número, só dígitos).
 * - Cada produto tem um "codigo". Para o catálogo mostrar PREÇO e ESTOQUE, cadastre no DistribPro
 *   um produto com esse mesmo código (ou use Produtos → "Cadastrar itens do catálogo").
 * - NUTRICAO: os valores abaixo são de REFERÊNCIA (médias para esse tipo de produto) e aparecem com aviso.
 *   Copie a tabela da embalagem de cada produto e mude "confirmada" para true.
 */
(function (raiz) {
  const CONFIG = {
    whatsapp: '5548999410749',
    atendente: 'Marcos',
    titulo: 'Catálogo Linha Varejo',
  };

  // Tabelas de referência por 50 g (porção de pão de queijo/biscoito, RDC 429/2020). Substitua pelas da embalagem.
  const N = {
    tradicional: { porcao: '50 g (2 unidades)', kcal: 160, carb: 19, acucares: 0, prot: 3, gord: 8, sat: 3, trans: 0, fibra: 0, sodio: 230 },
    recheadoSalgado: { porcao: '50 g', kcal: 165, carb: 17, acucares: 0.5, prot: 4, gord: 9, sat: 4, trans: 0, fibra: 0, sodio: 290 },
    recheadoDoce: { porcao: '50 g', kcal: 175, carb: 24, acucares: 9, prot: 3, gord: 7.5, sat: 3.5, trans: 0, fibra: 0, sodio: 170 },
    tapioca: { porcao: '50 g', kcal: 150, carb: 18, acucares: 0, prot: 4, gord: 7, sat: 4, trans: 0, fibra: 0, sodio: 250 },
    churros: { porcao: '50 g', kcal: 190, carb: 27, acucares: 10, prot: 2.5, gord: 8, sat: 3.5, trans: 0, fibra: 0.5, sodio: 120 },
    provolone: { porcao: '50 g', kcal: 170, carb: 18, acucares: 0, prot: 4.5, gord: 9, sat: 3.5, trans: 0, fibra: 0, sodio: 330 },
  };
  const PREPARO = 'Não precisa descongelar. Forno pré-aquecido a 180 °C por 25 a 30 minutos, ou na air fryer a 180 °C por 15 a 20 minutos, até dourar.';
  const CONSERVACAO = 'Manter congelado a −18 °C ou mais frio. Depois de aberto, fechar bem a embalagem.';

  const SECOES = [
    { id: 'idealpan', nome: 'Pães de Queijo Idealpan', cor: '#b3151b' },
    { id: 'tiatania', nome: 'Tia Tânia — Empanados', cor: '#c9a21a' },
    { id: 'mix', nome: 'Mix', cor: '#b3151b' },
    { id: 'empanados', nome: 'Empanados', cor: '#b3151b' },
    { id: 'donacreuza', nome: 'Dona Creuza', cor: '#b3151b' },
    { id: 'lowprice', nome: 'Low Price', cor: '#b3151b' },
  ];

  // codigo, secao, marca, nome, detalhe, embalagem, peso da unidade, imagem, tabela, selos
  const P = [
    ['IP-TRAD-2KG', 'idealpan', 'Idealpan', 'Pão de Queijo Tradicional', '', '2 kg', '25 g', 'tradicional', 'tradicional'],
    ['IP-TRAD-400', 'idealpan', 'Idealpan', 'Pão de Queijo Tradicional', '', '400 g', '25 g', 'tradicional', 'tradicional'],
    ['IP-COQ-800', 'idealpan', 'Idealpan', 'Pão de Queijo Coquetel', '', '800 g', '15 g', 'coquetel', 'tradicional'],
    ['IP-GOUR-800', 'idealpan', 'Idealpan', 'Pão de Queijo Gourmet', '2x mais queijo', '800 g', '25 g', 'gourmet', 'tradicional', ['Lançamento']],
    ['IP-LANCHE-1KG', 'idealpan', 'Idealpan', 'Pão de Queijo Lanche', '', '1 kg', '90 g', 'lanche', 'tradicional'],
    ['TT-CARNE-38', 'tiatania', 'Tia Tânia', 'Pão de Queijo Empanado', 'Recheado com carne seca e requeijão', '1 kg', '38 g', 'carne-seca', 'recheadoSalgado'],
    ['TT-CARNE-100', 'tiatania', 'Tia Tânia', 'Pão de Queijo Empanado', 'Recheado com carne seca e requeijão', '1 kg', '100 g', 'carne-seca', 'recheadoSalgado'],
    ['TT-FRANGO-38', 'tiatania', 'Tia Tânia', 'Pão de Queijo Empanado', 'Recheado com frango e requeijão', '1 kg', '38 g', 'frango', 'recheadoSalgado'],
    ['TT-FRANGO-100', 'tiatania', 'Tia Tânia', 'Pão de Queijo Empanado', 'Recheado com frango e requeijão', '1 kg', '100 g', 'frango', 'recheadoSalgado'],
    ['TT-DOCELEITE-38', 'tiatania', 'Tia Tânia', 'Pão de Queijo Empanado', 'Recheado com doce de leite Viçosa', '500 g', '38 g', 'doce-de-leite', 'recheadoDoce'],
    ['TT-REQ-38', 'tiatania', 'Tia Tânia', 'Pão de Queijo Empanado', 'Recheado com requeijão', '1 kg', '38 g', 'requeijao', 'recheadoSalgado'],
    ['IP-TAPIOCA-400', 'mix', 'Idealpan', 'Dadinho de Tapioca', '', '400 g', '30 g', 'dadinho-tapioca', 'tapioca'],
    ['IP-CHURROS-800', 'mix', 'Idealpan', 'Mini Churros Recheado', '', '800 g', '18 g', 'mini-churros', 'churros'],
    ['IP-PROVOLONE-1KG', 'mix', 'Idealpan', 'Biscoito de Provolone', '', '1 kg', '70 g', 'provolone', 'provolone'],
    ['IP-GOIABADA-800', 'empanados', 'Idealpan', 'Pão de Queijo Empanado', 'Recheado com goiabada', '800 g', '38 g', 'goiabada', 'recheadoDoce'],
    ['DC-TRAD-800', 'donacreuza', 'Dona Creuza', 'Pão de Queijo Dona Creuza', 'Tradicional', '800 g', '25 g', 'dona-creuza', 'tradicional', ['Lançamento']],
    ['TINO-TRAD-800', 'lowprice', 'Tino', 'Pão de Queijo Tradicional', '', '800 g', '25 g', 'tino', 'tradicional'],
    ['TINO-TRAD-400', 'lowprice', 'Tino', 'Pão de Queijo Tradicional', '', '400 g', '25 g', 'tino', 'tradicional'],
  ];

  const PRODUTOS = P.map(([codigo, secao, marca, nome, detalhe, embalagem, unidadePeso, img, tab, selos]) => ({
    codigo, secao, marca, nome, detalhe, embalagem, unidadePeso, selos: selos || [],
    imagem: `/catalogo/img/${img}.jpg`,
    nomeCompleto: `${nome}${detalhe ? ' ' + detalhe.charAt(0).toLowerCase() + detalhe.slice(1) : ''} ${embalagem} (un. ${unidadePeso})`.replace(/\s+/g, ' '),
    nutricao: { ...N[tab], confirmada: false },
    preparo: PREPARO, conservacao: CONSERVACAO,
  }));

  const api = { CONFIG, SECOES, PRODUTOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.Catalogo = api;
})(typeof window !== 'undefined' ? window : globalThis);
