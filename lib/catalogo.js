/* DistribPro — dados do catálogo interativo (página /catalogo).
 * Usado pelo servidor (preços e estoque) e pelo navegador (servido em /catalogo-dados.js).
 *
 * COMO EDITAR
 * - CONFIG.whatsapp: número que recebe orçamentos e pedidos (55 + DDD + número, só dígitos).
 * - Cada produto tem um "codigo". Para o catálogo mostrar PREÇO e ESTOQUE, cadastre no DistribPro
 *   um produto com esse mesmo código (ou use Produtos → "Cadastrar itens do catálogo").
 * - NUTRIÇÃO: as tabelas da Idealpan, Dona Creuza e Tinô foram copiadas do site www.idealpan.com.br (novembro/2026),
 *   com ingredientes, alérgicos e modo de preparo. "vd" guarda o %VD publicado. As da Tia Tânia ainda são valores de
 *   REFERÊNCIA (o site tiatania.com.br não respondeu) e aparecem com aviso: troque pelas da embalagem e use confirmada: true.
 */
(function (raiz) {
  const CONFIG = {
    whatsapp: '5548999410749',
    atendente: 'Marcos',
    titulo: 'Catálogo Linha Varejo',
  };

  // ---- Idealpan (site oficial www.idealpan.com.br) ----
  const SITE = 'https://www.idealpan.com.br/';
  const OBS_SODIO = 'No site, o sódio aparece em "g"; o %VD publicado confirma que o valor é em mg.';
  const SEM_GLUTEN = 'Contém ovos, derivados de soja e leite. Contém lactose. Não contém glúten.';
  const ING = {
    tradicional: 'Amido especial para pão de queijo (polvilho azedo especial, fécula de mandioca e amido de mandioca modificado), água, ovos integrais pasteurizados, óleo de soja, queijo minas artesanal, queijo parmesão, margarina, permeado de soro de leite em pó e sal refinado.',
    canastra: 'Amido especial para pão de queijo (polvilho azedo especial, fécula de mandioca e amido de mandioca modificado), água, ovos integrais pasteurizados, óleo de soja, queijo canastra, queijo parmesão, permeado de soro de leite em pó, margarina e sal refinado.',
    dadinho: 'Mix especial para dadinho de tapioca (tapioca granulada, fécula de mandioca, amido de mandioca modificado, óleo de soja, soro de leite em pó e sal), água e queijo minas artesanal.',
    churros: 'Água, doce de leite com amido, farinha de trigo enriquecida com ferro e ácido fólico, margarina (Agrobacterium tumefaciens e/ou Bacillus thuringiensis e/ou Delftia acidovorans e/ou Stenotrophomonas maltophilia e/ou Streptomyces viridochromogenes e/ou Zea mays), açúcar cristal, farinha de milho biju (canjica de milho Zea mays, Streptomyces viridochromogenes, Bacillus thuringiensis e Agrobacterium tumefaciens), batata desidratada em flocos, sal refinado iodado e aroma de baunilha artificial.',
    provolone: 'Polvilho especial (polvilho azedo especial, fécula de mandioca e amido de mandioca modificado), água, ovos integrais pasteurizados, óleo de soja, queijo canastra, queijo provolone fresco sabor defumado, margarina, soro de leite concentrado parcialmente desmineralizado e sal refinado.',
    goiabada: 'Pré-mistura para pão de queijo recheado (polvilho azedo, fécula de mandioca, amido de mandioca modificado, gordura vegetal, leite em pó integral e sal), recheio de goiabada, água, ovos integrais pasteurizados, queijo minas artesanal, queijo parmesão e óleo de soja.',
  };
  const DISTRIBUIR = ['Retire o produto do freezer e distribua os pães de queijo com cerca de 2 cm de distância entre eles.', 'Asse por 30 a 40 minutos.', 'Não use o micro-ondas para assar.'];
  const PREP = {
    gasEletrico: ['Pré-aqueça o forno (a gás: 200 °C por 10 minutos; elétrico: 180 °C por 5 minutos).', ...DISTRIBUIR],
    forno180: ['Pré-aqueça o forno a 180 °C por 10 minutos.', ...DISTRIBUIR],
    dadinho: ['Retire totalmente da embalagem.', 'Pré-aqueça o forno a 200 °C por 10 minutos.', 'Asse os dadinhos por 10 minutos.', 'Não use o micro-ondas para assar.'],
    churros: ['Coloque óleo suficiente para cobrir os churros e aqueça a 160 °C.', 'Frite os churros ainda congelados.', 'Quando começarem a dourar, mexa devagar para não grudarem.', 'Escorra em papel absorvente e polvilhe açúcar e canela.'],
  };
  const vdPadrao = { carb: 6, prot: 3, gord: 9, sat: 8, trans: 0, sodio: 14 };
  const T = (pagina, n, extra = {}) => ({ confirmada: true, fonte: SITE + pagina, ...n, ...extra });
  const TAB = {
    tradicional: T('tradicional.php', { porcao: '50 g (2 ½ unidades)', kcal: 125, carb: 17, acucares: 1.3, prot: 1.5, gord: 5.7, sat: 1.5, trans: 0, sodio: 285, vd: vdPadrao,
      obs: 'Não contém quantidades significativas de açúcares adicionados, gorduras trans e fibras alimentares. ' + OBS_SODIO }),
    coquetel: T('coquetel.php', { porcao: '50 g (3 ⅓ unidades)', kcal: 125, carb: 17, prot: 1.5, gord: 5.7, sat: 1.5, trans: 0, sodio: 285, vd: vdPadrao,
      obs: 'Não contém quantidades significativas de gorduras trans e fibra alimentar.' }),
    gourmet: T('gourmet.php', { porcao: '50 g (2 unidades)', kcal: 123, carb: 16, prot: 2.1, gord: 5.6, sat: 1.7, trans: 0, sodio: 295, vd: { carb: 5, prot: 4, gord: 9, sat: 9, trans: 0, sodio: 15 },
      obs: 'Não contém quantidades significativas de açúcares adicionados, gorduras trans e fibras alimentares. ' + OBS_SODIO }),
    lanche: T('lanche.php', { porcao: '50 g (5/9 de unidade)', kcal: 140, carb: 19, acucares: 1.5, prot: 1.7, gord: 6.4, sat: 1.7, trans: 0, sodio: 294, vd: { kcal: 7, carb: 6, prot: 3, gord: 10, sat: 9, trans: 0, sodio: 15 },
      obs: 'Não contém quantidades significativas de açúcares adicionados, gorduras trans e fibras alimentares. ' + OBS_SODIO }),
    dadinho: T('dadinho.php', { porcao: '50 g (2 ½ unidades)', kcal: 119, carb: 17, prot: 1.3, gord: 5.1, sat: 1.1, trans: 0, sodio: 274, vd: { carb: 6, prot: 2, gord: 9, sat: 5, trans: 0, sodio: 11 },
      obs: 'Não contém quantidades significativas de gorduras trans e fibra alimentar.' }),
    churros: T('churros.php', { porcao: '40 g (2 2/19 unidades)', kcal: 89, carb: 15, acucares: 6.9, acucaresAdic: 6.2, prot: 2.1, gord: 2.3, sat: 0.7, trans: 0, sodio: 100,
      vd: { carb: 5, acucaresAdic: 12, prot: 4, gord: 4, sat: 4, trans: 0, sodio: 5 }, obs: 'Não contém quantidades significativas de gorduras trans e fibra alimentar.' }),
    provolone: T('biscoito_provolone.php', { porcao: '50 g (5/7 de unidade)', kcal: 141, carb: 19, prot: 1.6, gord: 6.5, sat: 1.7, trans: 0, sodio: 315, vd: { carb: 6, prot: 3, gord: 10, sat: 9, trans: 0, sodio: 16 },
      obs: 'Não contém quantidades significativas de gorduras trans e fibra alimentar. ' + OBS_SODIO }),
    goiabada: T('recheado_goiabada.php', { porcao: '40 g (1 unidade)', kcal: 138, carb: 15, acucares: 2.8, acucaresAdic: 2.2, prot: 2.7, gord: 7.5, sat: 2.2, trans: 0, fibra: 0.4, sodio: 228,
      vd: { carb: 5, acucaresAdic: 4, prot: 5, gord: 11, sat: 11, trans: 0, fibra: 2, sodio: 11 } }),
    donacreuza: T('donacreuza.php', { porcao: '50 g (2 ½ unidades)', kcal: 125, carb: 17, acucares: 1.3, prot: 1.5, gord: 5.7, sat: 1.5, trans: 0, sodio: 285, vd: vdPadrao,
      obs: 'Não contém quantidades significativas de açúcares adicionados, gorduras trans e fibras alimentares. ' + OBS_SODIO }),
    tino: T('tino.php', { porcao: '50 g (2 ½ unidades)', kcal: 125, carb: 17, prot: 1.5, gord: 5.7, sat: 1.5, trans: 0, sodio: 285, vd: vdPadrao,
      obs: 'Não contém quantidades significativas de gorduras trans e fibra alimentar. ' + OBS_SODIO }),
  };
  // ---- Tia Tânia: valores de REFERÊNCIA por 50 g (site não disponível). Substitua pelos da embalagem. ----
  const REF = {
    recheadoSalgado: { porcao: '50 g', kcal: 165, carb: 17, acucares: 0.5, prot: 4, gord: 9, sat: 4, trans: 0, fibra: 0, sodio: 290, confirmada: false },
    recheadoDoce: { porcao: '50 g', kcal: 175, carb: 24, acucares: 9, prot: 3, gord: 7.5, sat: 3.5, trans: 0, fibra: 0, sodio: 170, confirmada: false },
  };
  // info: [tabela nutricional, ingredientes, alérgicos, modo de preparo]
  const INFO = {
    tradicional: [TAB.tradicional, ING.tradicional, SEM_GLUTEN, PREP.gasEletrico], coquetel: [TAB.coquetel, ING.canastra, SEM_GLUTEN, PREP.forno180],
    gourmet: [TAB.gourmet, ING.tradicional, SEM_GLUTEN, PREP.gasEletrico], lanche: [TAB.lanche, ING.tradicional, SEM_GLUTEN, PREP.gasEletrico],
    dadinho: [TAB.dadinho, ING.dadinho, SEM_GLUTEN, PREP.dadinho],
    churros: [TAB.churros, ING.churros, 'Contém derivados de trigo, soja e leite. Pode conter ovos, centeio, cevada e aveia. Contém lactose. Contém glúten.', PREP.churros],
    provolone: [TAB.provolone, ING.provolone, SEM_GLUTEN, PREP.forno180], goiabada: [TAB.goiabada, ING.goiabada, SEM_GLUTEN, PREP.gasEletrico],
    donacreuza: [TAB.donacreuza, ING.tradicional, SEM_GLUTEN, PREP.gasEletrico], tino: [TAB.tino, ING.canastra, SEM_GLUTEN, PREP.forno180],
    recheadoSalgado: [REF.recheadoSalgado, '', '', ['Não precisa descongelar.', 'Asse em forno pré-aquecido a 180 °C por 25 a 30 minutos, ou na air fryer a 180 °C por 15 a 20 minutos, até dourar.']],
    recheadoDoce: [REF.recheadoDoce, '', '', ['Não precisa descongelar.', 'Asse em forno pré-aquecido a 180 °C por 25 a 30 minutos, ou na air fryer a 180 °C por 15 a 20 minutos, até dourar.']],
  };
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
    ['IP-COQ-800', 'idealpan', 'Idealpan', 'Pão de Queijo Coquetel', '', '800 g', '15 g', 'coquetel', 'coquetel'],
    ['IP-GOUR-800', 'idealpan', 'Idealpan', 'Pão de Queijo Gourmet', '2x mais queijo', '800 g', '25 g', 'gourmet', 'gourmet', ['Lançamento']],
    ['IP-LANCHE-1KG', 'idealpan', 'Idealpan', 'Pão de Queijo Lanche', '', '1 kg', '90 g', 'lanche', 'lanche'],
    ['TT-CARNE-38', 'tiatania', 'Tia Tânia', 'Pão de Queijo Empanado', 'Recheado com carne seca e requeijão', '1 kg', '38 g', 'carne-seca', 'recheadoSalgado'],
    ['TT-CARNE-100', 'tiatania', 'Tia Tânia', 'Pão de Queijo Empanado', 'Recheado com carne seca e requeijão', '1 kg', '100 g', 'carne-seca', 'recheadoSalgado'],
    ['TT-FRANGO-38', 'tiatania', 'Tia Tânia', 'Pão de Queijo Empanado', 'Recheado com frango e requeijão', '1 kg', '38 g', 'frango', 'recheadoSalgado'],
    ['TT-FRANGO-100', 'tiatania', 'Tia Tânia', 'Pão de Queijo Empanado', 'Recheado com frango e requeijão', '1 kg', '100 g', 'frango', 'recheadoSalgado'],
    ['TT-DOCELEITE-38', 'tiatania', 'Tia Tânia', 'Pão de Queijo Empanado', 'Recheado com doce de leite Viçosa', '500 g', '38 g', 'doce-de-leite', 'recheadoDoce'],
    ['TT-REQ-38', 'tiatania', 'Tia Tânia', 'Pão de Queijo Empanado', 'Recheado com requeijão', '1 kg', '38 g', 'requeijao', 'recheadoSalgado'],
    ['IP-TAPIOCA-400', 'mix', 'Idealpan', 'Dadinho de Tapioca', '', '400 g', '30 g', 'dadinho-tapioca', 'dadinho'],
    ['IP-CHURROS-800', 'mix', 'Idealpan', 'Mini Churros Recheado', '', '800 g', '18 g', 'mini-churros', 'churros'],
    ['IP-PROVOLONE-1KG', 'mix', 'Idealpan', 'Biscoito de Provolone', '', '1 kg', '70 g', 'provolone', 'provolone'],
    ['IP-GOIABADA-800', 'empanados', 'Idealpan', 'Pão de Queijo Empanado', 'Recheado com goiabada', '800 g', '38 g', 'goiabada', 'goiabada'],
    ['DC-TRAD-800', 'donacreuza', 'Dona Creuza', 'Pão de Queijo Dona Creuza', 'Tradicional', '800 g', '25 g', 'dona-creuza', 'donacreuza', ['Lançamento']],
    ['TINO-TRAD-800', 'lowprice', 'Tino', 'Pão de Queijo Tradicional', '', '800 g', '25 g', 'tino', 'tino'],
    ['TINO-TRAD-400', 'lowprice', 'Tino', 'Pão de Queijo Tradicional', '', '400 g', '25 g', 'tino', 'tino'],
  ];

  // Código de cada item no Mercos (vínculo automático da integração)
  const MERCOS = { 'IP-TRAD-2KG': '13', 'IP-TRAD-400': '1', 'IP-COQ-800': '22', 'IP-GOUR-800': '11', 'IP-LANCHE-1KG': '2', 'TT-CARNE-38': '27', 'TT-CARNE-100': '25',
    'TT-FRANGO-38': '28', 'TT-FRANGO-100': '26', 'TT-DOCELEITE-38': '31', 'TT-REQ-38': '32', 'IP-TAPIOCA-400': '16', 'IP-CHURROS-800': '10', 'IP-PROVOLONE-1KG': '5',
    'IP-GOIABADA-800': '23', 'DC-TRAD-800': '35', 'TINO-TRAD-800': '12', 'TINO-TRAD-400': '7' };

  const PRODUTOS = P.map(([codigo, secao, marca, nome, detalhe, embalagem, unidadePeso, img, tab, selos]) => ({
    codigo, mercos: MERCOS[codigo] || '', secao, marca, nome, detalhe, embalagem, unidadePeso, selos: selos || [],
    imagem: `/catalogo/img/${img}.jpg`,
    nomeCompleto: `${nome}${detalhe ? ' ' + detalhe.charAt(0).toLowerCase() + detalhe.slice(1) : ''} ${embalagem} (un. ${unidadePeso})`.replace(/\s+/g, ' '),
    nutricao: INFO[tab][0], ingredientes: INFO[tab][1], alergicos: INFO[tab][2], preparo: INFO[tab][3], conservacao: CONSERVACAO,
  }));

  const api = { CONFIG, SECOES, PRODUTOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.Catalogo = api;
})(typeof window !== 'undefined' ? window : globalThis);
