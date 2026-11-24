/* RepCRM — dados de demonstração (fictícios). */
'use strict';
const R = require('./regras');

function baseVazia() {
  return { config: { nome: 'Representante', empresa: '', cnpj: '', core: '', telefone: '', email: '', cidade: '', uf: '', rodape: '' },
    seq: { pedido: 0 }, representadas: [], clientes: [], produtos: [], oportunidades: [], pedidos: [], atividades: [], usuarios: [] };
}

function seedDemo(uid) {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; // pseudoaleatório fixo: demo sempre igual
  const pick = a => a[Math.floor(rnd() * a.length)];
  const d = baseVazia();
  d.config = { nome: 'Marcos Andrade', empresa: 'Andrade Representações Ltda', cnpj: '12.345.678/0001-90', core: 'CORE-PR 12345', telefone: '(41) 99999-0000', email: 'marcos@andraderep.com.br', cidade: 'Curitiba', uf: 'PR', rodape: 'Pedido sujeito à aprovação de crédito e confirmação de estoque pela representada.' };
  const H = R.hoje();

  const reps = [
    { nome: 'Têxtil Aurora', razao: 'Aurora Indústria Têxtil S.A.', segmento: 'Cama, mesa e banho', comissao: 5, baseComissao: 'Faturamento', diasComissao: 30, metaMensal: 60000, pedidoMinimo: 1500, condicoes: '28/42/56', cor: '#7c3aed', contato: 'Fernanda (comercial)', telefone: '(47) 3333-1000', email: 'pedidos@aurora.example' },
    { nome: 'Passo Firme Calçados', razao: 'Passo Firme Calçados Ltda', segmento: 'Calçados', comissao: 6, baseComissao: 'Pagamento', diasComissao: 10, metaMensal: 45000, pedidoMinimo: 2000, condicoes: '30/60/90', cor: '#d97706', contato: 'Ricardo (gerente regional)', telefone: '(51) 3222-2000', email: 'vendas@passofirme.example' },
    { nome: 'Lar Bom Utilidades', razao: 'Lar Bom Utilidades Domésticas Ltda', segmento: 'Utilidades domésticas', comissao: 4, baseComissao: 'Faturamento', diasComissao: 20, metaMensal: 35000, pedidoMinimo: 800, condicoes: '28/35/42', cor: '#059669', contato: 'Juliana (SAC representantes)', telefone: '(11) 4000-3000', email: 'rep@larbom.example' },
  ].map(r => ({ id: uid(), cnpj: '', site: '', obs: '', ativo: 'Sim', ...r }));
  d.representadas = reps;

  const catalogo = [
    [reps[0], [['AU-100', 'Jogo de lençol casal 150 fios', 'JG', 89.9, 0], ['AU-110', 'Jogo de lençol queen 200 fios', 'JG', 129.9, 0], ['AU-200', 'Toalha de banho fio penteado', 'UN', 34.5, 0], ['AU-210', 'Toalha de rosto fio penteado', 'UN', 16.9, 0], ['AU-300', 'Edredom casal dupla face', 'UN', 159, 0], ['AU-400', 'Toalha de mesa 8 lugares', 'UN', 69.9, 0], ['AU-500', 'Kit pano de prato (3 un.)', 'KT', 19.9, 0]]],
    [reps[1], [['PF-01', 'Tênis casual masculino', 'PR', 119, 0], ['PF-02', 'Sapatênis couro', 'PR', 149, 0], ['PF-10', 'Sandália feminina rasteira', 'PR', 59.9, 0], ['PF-11', 'Sapatilha feminina', 'PR', 64.9, 0], ['PF-20', 'Bota cano curto', 'PR', 189, 0], ['PF-30', 'Chinelo slide', 'PR', 29.9, 0]]],
    [reps[2], [['LB-1001', 'Jogo de panelas antiaderente 5 pç', 'JG', 249, 10], ['LB-1002', 'Frigideira 24 cm', 'UN', 59.9, 10], ['LB-2001', 'Pote hermético 1 L', 'UN', 12.9, 5], ['LB-2002', 'Kit potes 5 pç', 'KT', 49.9, 5], ['LB-3001', 'Garrafa térmica 1 L', 'UN', 69.9, 10], ['LB-4001', 'Escorredor de louça inox', 'UN', 89.9, 10], ['LB-5001', 'Faqueiro 24 pç', 'CX', 119, 10]]],
  ];
  for (const [rep, itens] of catalogo) for (const [codigo, descricao, unidade, preco, ipi] of itens)
    d.produtos.push({ id: uid(), representadaId: rep.id, codigo, descricao, unidade, embalagem: 0, preco, ipi, comissao: 0, ean: '', ativo: 'Sim' });

  const cidades = [['Curitiba', 'PR'], ['Ponta Grossa', 'PR'], ['Londrina', 'PR'], ['Maringá', 'PR'], ['Joinville', 'SC'], ['Cascavel', 'PR']];
  const nomes = [['Magazine Bela Casa', 'Bela Casa', 'Loja de departamento'], ['Casa & Conforto Enxovais', 'Casa & Conforto', 'Enxovais'], ['Calçados Pé Leve', 'Pé Leve', 'Calçados'], ['Lojas Estrela do Sul', 'Estrela do Sul', 'Loja de departamento'],
    ['Utilidades Ponto Certo', 'Ponto Certo', 'Utilidades'], ['Comercial Família Unida', 'Família Unida', 'Loja de departamento'], ['Sapataria Central', 'Sapataria Central', 'Calçados'], ['Enxovais Doce Lar', 'Doce Lar', 'Enxovais'],
    ['Supermercado Bom Preço', 'Bom Preço', 'Supermercado'], ['Bazar da Vila', 'Bazar da Vila', 'Utilidades'], ['Moda & Passo', 'Moda & Passo', 'Calçados'], ['Casa Nova Presentes', 'Casa Nova', 'Presentes']];
  const contatos = ['Ana Paula', 'Roberto', 'Cláudia', 'Sérgio', 'Patrícia', 'Luís Carlos', 'Mariana', 'José', 'Renata', 'Paulo', 'Simone', 'Eduardo'];
  d.clientes = nomes.map(([razao, fantasia, segmento], i) => {
    const [cidade, uf] = cidades[i % cidades.length];
    return { id: uid(), razao: razao + ' Ltda', fantasia, cnpj: `${10 + i}.${100 + i * 7}.${200 + i * 3}/0001-${String(10 + i).padStart(2, '0')}`, ie: '', contato: contatos[i], cargo: pick(['Comprador(a)', 'Proprietário(a)', 'Gerente']),
      telefone: `(41) 3${String(100 + i).padStart(3, '0')}-${String(1000 + i * 37).slice(0, 4)}`, whatsapp: `(41) 9${String(8800 + i * 11)}-${String(2000 + i * 53).slice(0, 4)}`, email: `compras@${fantasia.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.example`,
      logradouro: pick(['Rua XV de Novembro', 'Av. Brasil', 'Rua das Flores', 'Av. Paraná', 'Rua Sete de Setembro']), numero: String(100 + i * 13), bairro: 'Centro', cidade, uf, cep: '',
      segmento, status: i >= 10 ? 'Prospect' : 'Ativo', origem: pick(['Indicação', 'Visita fria', 'Feira', 'Representada']), cicloCompra: pick([30, 45, 60]), aniversario: '', obs: '', criadoEm: R.addDays(H, -400) };
  });
  const ativos = d.clientes.filter(c => c.status === 'Ativo');

  // Pedidos dos últimos 12 meses
  const conds = { [reps[0].id]: '28/42/56', [reps[1].id]: '30/60/90', [reps[2].id]: '28/35/42' };
  for (let k = 0; k < 70; k++) {
    const idade = Math.floor(rnd() * 360) + 3;
    const cli = ativos[Math.floor(rnd() * (k % 5 === 0 ? 3 : ativos.length))]; // alguns clientes compram bem mais (curva ABC)
    if (cli === ativos[7] && idade < 120) continue; // um cliente "sumido" para aparecer na reativação
    const rep = pick(reps);
    const prods = d.produtos.filter(p => p.representadaId === rep.id);
    const itens = []; const usados = new Set();
    for (let j = 0; j < 2 + Math.floor(rnd() * 4); j++) {
      const p = pick(prods); if (usados.has(p.id)) continue; usados.add(p.id);
      itens.push({ produtoId: p.id, codigo: p.codigo, descricao: p.descricao, unidade: p.unidade, qtd: (2 + Math.floor(rnd() * 10)) * 6, preco: p.preco, desc: pick([0, 0, 3, 5]), ipi: p.ipi, comissao: rep.comissao });
    }
    const data = R.addDays(H, -idade);
    const ped = { id: uid(), numero: 0, data, clienteId: cli.id, representadaId: rep.id, itens, descontoGeral: 0, condicao: conds[rep.id], prazoEntrega: '15 dias', transportadora: '', obs: '',
      status: 'Entregue', pedidoFabrica: String(50000 + k * 17), nf: '', dataFaturamento: R.addDays(data, 5), valorFaturado: 0, comissoes: [], historico: [], criadoEm: data + 'T10:00:00.000Z', criadoPor: d.config.nome };
    if (idade < 8) Object.assign(ped, { status: 'Enviado', dataFaturamento: '' });
    else if (idade < 15) ped.status = 'Faturado';
    if (k === 3) ped.status = 'Cancelado', ped.dataFaturamento = '';
    if (R.faturado(ped)) {
      ped.nf = String(120000 + k * 7);
      ped.comissoes = R.parcelasComissao(ped, rep);
      for (const c of ped.comissoes) if (c.venc < R.addDays(H, -5)) Object.assign(c, { recebida: true, recebidaEm: R.addDays(c.venc, 2), valorRecebido: c.valor });
    }
    d.pedidos.push(ped);
  }
  d.pedidos.sort((a, b) => a.data.localeCompare(b.data)).forEach((p, i) => p.numero = i + 1);
  d.seq.pedido = d.pedidos.length;
  // um orçamento ainda não enviado
  const orc = { ...d.pedidos[d.pedidos.length - 1], id: uid(), numero: ++d.seq.pedido, data: H, status: 'Orçamento', pedidoFabrica: '', nf: '', dataFaturamento: '', comissoes: [], historico: [] };
  d.pedidos.push(orc);

  // Funil de vendas
  const prospects = d.clientes.filter(c => c.status === 'Prospect');
  const ops = [
    ['Abertura de conta — linha de enxoval', prospects[0], reps[0], 8000, 'Qualificação', 20],
    ['Primeiro pedido calçados verão', prospects[1], reps[1], 12000, 'Proposta', 15],
    ['Coleção inverno — botas', ativos[2], reps[1], 18000, 'Negociação', 10],
    ['Reposição panelas Black Friday', ativos[0], reps[2], 9500, 'Proposta', 7],
    ['Mix de toalhas para loja nova', ativos[3], reps[0], 15000, 'Prospecção', 40],
    ['Kit utilidades para campanha de Natal', ativos[8], reps[2], 6000, 'Negociação', 5],
    ['Ampliação linha de cama', ativos[1], reps[0], 7000, 'Perdida', -20],
  ];
  d.oportunidades = ops.map(([titulo, c, r, valor, etapa, dias]) => ({ id: uid(), titulo, clienteId: c.id, representadaId: r.id, valor, etapa, probabilidade: R.PROB[etapa], previsao: R.addDays(H, dias), obs: '',
    motivoPerda: etapa === 'Perdida' ? 'Preço acima da concorrência' : '', criadaEm: R.addDays(H, -30), fechadaEm: etapa === 'Perdida' ? R.addDays(H, -3) : '', pedidoId: '' }));

  // Agenda
  const at = (dias, tipo, c, assunto, hora = '', status = 'Pendente', resultado = '') => ({ id: uid(), tipo, clienteId: c.id, oportunidadeId: '', data: R.addDays(H, dias), hora, assunto, descricao: '', status, resultado, concluidaEm: status === 'Concluída' ? R.addDays(H, dias) : '', criadaPor: d.config.nome });
  d.atividades = [
    at(-2, 'Ligação', ativos[4], 'Confirmar recebimento da mercadoria', '10:00'),
    at(-1, 'WhatsApp', prospects[0], 'Enviar catálogo Aurora em PDF'),
    at(0, 'Visita', ativos[2], 'Apresentar coleção de inverno', '09:30'),
    at(0, 'Ligação', ativos[0], 'Negociar prazo do pedido de panelas', '14:00'),
    at(0, 'Tarefa', ativos[5], 'Conferir extrato de comissões da Aurora'),
    at(1, 'Visita', prospects[1], 'Levar amostras de calçados', '15:00'),
    at(3, 'Reunião', ativos[3], 'Planejamento de mix para loja nova', '10:00'),
    at(7, 'E-mail', ativos[8], 'Enviar proposta da campanha de Natal'),
    at(-5, 'Visita', ativos[1], 'Visita de rotina', '11:00', 'Concluída', 'Cliente com estoque alto, retornar em 30 dias.'),
    at(-10, 'Ligação', ativos[7], 'Oferecer lançamentos', '', 'Concluída', 'Não atendeu. Tentar de novo.'),
  ];
  return d;
}

module.exports = { seedDemo, baseVazia };
