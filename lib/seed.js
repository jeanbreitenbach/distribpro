/* Dados de demonstração */
const R = require('./regras');

function baseVazia() {
  return {
    empresa: { nome: 'Minha Distribuidora Ltda', fantasia: 'Minha Distribuidora', cnpj: '00.000.000/0001-00', ie: '', telefone: '(11) 4000-0000', email: 'contato@minhadistribuidora.com.br',
      logradouro: 'Av. Central', numero: '1000', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', cep: '01000-000', regime: '1' },
    seq: { pedido: 1000, nfe: 0, compra: 0 },
    produtos: [], clientes: [], vendedores: [], pedidos: [], movimentos: [], titulos: [], usuarios: [], fornecedores: [], pagar: [], compras: [], bancos: [], extrato: [], visitas: [],
    condicoes: [{ id: 'c1', nome: 'À vista', parcelas: '0' }, { id: 'c2', nome: '28 dias', parcelas: '28' }, { id: 'c3', nome: '28/56', parcelas: '28,56' }, { id: 'c4', nome: '30/60/90', parcelas: '30,60,90' }],
    tabelas: [{ id: 't1', nome: 'Padrão', ajuste: 0 }, { id: 't2', nome: 'Atacado (-5%)', ajuste: -5 }, { id: 't3', nome: 'Key Account (-8%)', ajuste: -8 }, { id: 't4', nome: 'Varejo (+5%)', ajuste: 5 }],
  };
}

function seedDemo(uid, hashSenha) {
  const d = baseVazia();
  const hoje = R.hoje();
  d.vendedores = [
    { id: 'v1', nome: 'Carlos Mendes', email: 'carlos@distribpro.local', telefone: '(11) 98888-1111', comissao: 3, meta: 60000, ativo: 'Sim' },
    { id: 'v2', nome: 'Ana Ribeiro', email: 'ana@distribpro.local', telefone: '(11) 98888-2222', comissao: 3.5, meta: 75000, ativo: 'Sim' },
    { id: 'v3', nome: 'Rafael Souza', email: 'rafael@distribpro.local', telefone: '(11) 98888-3333', comissao: 2.5, meta: 45000, ativo: 'Sim' }];
  const P = [['Refrigerante Cola 2L', 'Bebidas', 'UN', 8.9, 5.2, '22021000'], ['Água Mineral 500ml cx12', 'Bebidas', 'CX', 14.5, 8.1, '22011000'], ['Suco Laranja 1L', 'Bebidas', 'UN', 7.4, 4.3, '20091200'], ['Cerveja Lata 350ml cx12', 'Bebidas', 'CX', 42.9, 29.5, '22030000'],
    ['Arroz Tipo 1 5kg', 'Mercearia', 'PCT', 27.9, 19.8, '10063021'], ['Feijão Carioca 1kg', 'Mercearia', 'PCT', 8.49, 5.6, '07133399'], ['Açúcar Refinado 1kg', 'Mercearia', 'PCT', 4.99, 3.2, '17019900'], ['Óleo de Soja 900ml', 'Mercearia', 'UN', 7.29, 5.1, '15079011'],
    ['Café Torrado 500g', 'Mercearia', 'PCT', 18.9, 12.4, '09012100'], ['Macarrão Espaguete 500g', 'Mercearia', 'PCT', 4.59, 2.7, '19021900'], ['Detergente 500ml', 'Limpeza', 'UN', 2.49, 1.3, '34022000'], ['Sabão em Pó 1kg', 'Limpeza', 'CX', 13.9, 8.7, '34022000'],
    ['Água Sanitária 2L', 'Limpeza', 'UN', 6.2, 3.4, '28289011'], ['Papel Higiênico 12un', 'Higiene', 'PCT', 19.9, 12.9, '48181000'], ['Creme Dental 90g', 'Higiene', 'UN', 4.29, 2.4, '33061000'], ['Sabonete 90g', 'Higiene', 'UN', 2.19, 1.1, '34011190']];
  d.produtos = P.map((p, i) => ({ id: 'p' + (i + 1), codigo: String(1001 + i), nome: p[0], categoria: p[1], unidade: p[2], preco: p[3], custo: p[4], ncm: p[5],
    estoque: Math.round(60 + Math.random() * 380), estoqueMin: 50, marca: '', ean: '789' + String(1000000000 + i * 7919).slice(0, 10), ativo: 'Sim' }));
  d.produtos[3].estoque = 22; d.produtos[10].estoque = 18;
  // itens do catálogo público (/catalogo), com o mesmo código — preços fictícios de demonstração
  const PC = { 'IP-TRAD-2KG': 42.9, 'IP-TRAD-800': 19.9, 'IP-TRAD-400': 11.9, 'IP-COQ-800': 21.9, 'IP-GOUR-800': 24.9, 'IP-LANCHE-1KG': 26.9, 'TT-CARNE-38': 39.9, 'TT-CARNE-100': 41.9, 'TT-FRANGO-38': 38.9, 'TT-FRANGO-100': 40.9,
    'TT-DOCELEITE-38': 24.9, 'TT-REQ-38': 37.9, 'IP-TAPIOCA-400': 16.9, 'IP-CHURROS-800': 22.9, 'IP-PROVOLONE-1KG': 29.9, 'IP-GOIABADA-800': 23.9, 'DC-TRAD-800': 19.9, 'TINO-TRAD-800': 15.9, 'TINO-TRAD-400': 8.9 };
  require('./catalogo').PRODUTOS.forEach((c, i) => d.produtos.push({ id: 'pc' + (i + 1), codigo: c.codigo, nome: c.nomeCompleto, categoria: 'Congelados', unidade: 'PCT', preco: PC[c.codigo], custo: Math.round(PC[c.codigo] * 65) / 100,
    ncm: '19012000', estoque: c.codigo === 'IP-GOUR-800' ? 8 : Math.round(30 + Math.random() * 200), estoqueMin: 10, marca: c.marca, ean: '', ativo: 'Sim' }));
  const C = [['Mercado Bom Preço Ltda', 'Bom Preço', 'São Paulo'], ['Supermercado Avenida Ltda', 'Avenida', 'Guarulhos'], ['Empório Santa Luzia Ltda', 'Santa Luzia', 'Campinas'], ['Mini Box Central ME', 'Mini Box', 'Osasco'],
    ['Padaria Pão Dourado Ltda', 'Pão Dourado', 'Santo André'], ['Atacarejo Real Ltda', 'Real', 'Jundiaí'], ['Mercearia do Zé ME', 'Zé', 'Mogi das Cruzes'], ['Restaurante Sabor Caseiro Ltda', 'Sabor Caseiro', 'São Paulo']];
  d.clientes = C.map((c, i) => ({ id: 'cl' + (i + 1), razao: c[0], fantasia: c[1], cnpj: `${10 + i}.${100 + i * 3}.${200 + i * 7}/0001-${10 + i}`, ie: '', cidade: c[2], uf: 'SP',
    logradouro: 'Rua Comercial', numero: String(100 + i * 25), bairro: 'Centro', cep: '0' + (1000 + i * 37) + '-000',
    telefone: '(11) 3' + (100 + i) + '-' + (4000 + i * 11), email: 'compras@' + c[1].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '') + '.com.br',
    vendedorId: 'v' + (i % 3 + 1), tabelaId: ['t1', 't2', 't3', 't4'][i % 4], condicaoId: ['c2', 'c3', 'c4', 'c1'][i % 4], limite: [20000, 35000, 15000, 10000][i % 4], ativo: 'Sim' }));

  // pedidos históricos em ordem cronológica
  const st = ['Entregue', 'Entregue', 'Entregue', 'Faturado', 'Faturado', 'Em separação', 'Aprovado', 'Orçamento', 'Cancelado'];
  const gerados = [];
  for (let k = 0; k < 60; k++) {
    const cli = d.clientes[k % d.clientes.length];
    const dt = k < 6 ? R.addDays(hoje, -k) : R.addDays(hoje, -6 - Math.floor(Math.random() * 165));
    const itens = [], used = new Set(), n = 2 + Math.floor(Math.random() * 5);
    for (let j = 0; j < n; j++) {
      const p = d.produtos[Math.floor(Math.random() * d.produtos.length)]; if (used.has(p.id)) continue; used.add(p.id);
      itens.push({ produtoId: p.id, qtd: 5 + Math.floor(Math.random() * 40), preco: R.precoCliente(d, p, cli), desc: 0 });
    }
    const status = k < 6 ? ['Orçamento', 'Aprovado', 'Em separação', 'Aprovado', 'Faturado', 'Orçamento'][k] : st[Math.floor(Math.random() * st.length)];
    gerados.push({ ped: { id: uid(), numero: 0, data: dt, entrega: R.addDays(dt, 3), clienteId: cli.id, vendedorId: cli.vendedorId, condicaoId: cli.condicaoId, itens,
      frete: 0, descontoGeral: 0, obs: '', status: 'Orçamento', origem: 'Vendedor', criadoPor: '' }, status });
  }
  gerados.sort((a, b) => a.ped.data.localeCompare(b.ped.data));
  const alvo = {}; d.produtos.forEach(p => { alvo[p.id] = p.estoque; p.estoque = 0; });
  gerados.forEach(g => { if (R.BAIXA.includes(g.status)) g.ped.itens.forEach(i => alvo[i.produtoId] += i.qtd); });
  d.produtos.forEach(p => R.movimentar(d, p.id, 'Entrada', alvo[p.id], 'Saldo inicial', R.addDays(hoje, -180), uid));
  gerados.forEach(({ ped, status }) => { ped.numero = ++d.seq.pedido; d.pedidos.push(ped); R.mudarStatus(d, ped, status, uid, ped.data); });
  d.titulos.forEach(t => { if (t.vencimento < hoje && Math.random() < 0.8) { t.pago = true; t.dataPagamento = t.vencimento; } });

  // fornecedores e compras
  d.fornecedores = [
    { id: 'f1', razao: 'Bebidas Brasil Indústria S.A.', fantasia: 'Bebidas Brasil', cnpj: '61.111.222/0001-01', categoria: 'Bebidas', contato: 'Marcos', telefone: '(11) 3500-1000', email: 'vendas@bebidasbrasil.com.br', cidade: 'Jundiaí', uf: 'SP', prazo: '28,42', pix: '61.111.222/0001-01', ativo: 'Sim' },
    { id: 'f2', razao: 'Alimentos União Ltda', fantasia: 'União Alimentos', cnpj: '62.333.444/0001-02', categoria: 'Mercearia', contato: 'Patrícia', telefone: '(19) 3200-2000', email: 'comercial@uniaoalimentos.com.br', cidade: 'Campinas', uf: 'SP', prazo: '30,60', pix: 'financeiro@uniaoalimentos.com.br', ativo: 'Sim' },
    { id: 'f3', razao: 'Limpex Química Ltda', fantasia: 'Limpex', cnpj: '63.555.666/0001-03', categoria: 'Limpeza', contato: 'Roberto', telefone: '(11) 4100-3000', email: 'pedidos@limpex.com.br', cidade: 'Diadema', uf: 'SP', prazo: '28', ativo: 'Sim' },
    { id: 'f4', razao: 'Higiene Total Distribuidora Ltda', fantasia: 'Higiene Total', cnpj: '64.777.888/0001-04', categoria: 'Higiene', contato: 'Juliana', telefone: '(11) 4200-4000', email: 'vendas@higienetotal.com.br', cidade: 'São Paulo', uf: 'SP', prazo: '21,35', ativo: 'Sim' }];
  const fornDe = { Bebidas: 'f1', Mercearia: 'f2', Limpeza: 'f3', Higiene: 'f4' };
  [[-75, 'f2'], [-52, 'f1'], [-38, 'f3'], [-24, 'f2'], [-15, 'f4'], [-6, 'f1']].forEach(([dd, fid], k) => {
    const prods = d.produtos.filter(p => fornDe[p.categoria] === fid && !['p4', 'p11'].includes(p.id)); // p4 e p11 ficam com estoque baixo na demo
    const c = { id: uid(), numero: ++d.seq.compra, fornecedorId: fid, nf: String(40210 + k * 137), data: R.addDays(hoje, dd), frete: k % 2 ? 120 : 0, outras: 0,
      itens: prods.map(p => ({ produtoId: p.id, qtd: 24 + Math.floor(Math.random() * 60), custo: p.custo })), parcelas: d.fornecedores.find(f => f.id === fid).prazo,
      atualizarCusto: false, obs: '', criadoPor: 'Administrador', criadoEm: new Date().toISOString() };
    d.compras.push(c); R.lancarCompra(d, c, uid);
  });
  // despesas fixas mensais (3 meses para trás e 2 para frente)
  const fixas = [['Aluguel do galpão', 'Aluguel', 1200, 5], ['Folha de pagamento', 'Salários e encargos', 1500, 5], ['Energia elétrica', 'Energia / água / internet', 280, 12],
    ['Internet e telefonia', 'Energia / água / internet', 120, 15], ['DAS - Simples Nacional', 'Impostos', 320, 20], ['Combustível da frota', 'Combustível / veículos', 450, 25]];
  for (let m = -3; m <= 2; m++) {
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + m);
    fixas.forEach(([desc, cat, v, dia]) => {
      const venc = new Date(base.getFullYear(), base.getMonth(), dia, 12).toISOString().slice(0, 10);
      d.pagar.push({ id: uid(), fornecedorId: '', descricao: desc, categoria: cat, documento: '', parcela: '', emissao: R.addDays(venc, -10), vencimento: venc,
        valor: R.r2(v * (0.95 + Math.random() * 0.1)), pago: false, dataPagamento: '', valorPago: 0, obs: '' });
    });
  }
  d.pagar.forEach(t => { if (t.vencimento < hoje && Math.random() < 0.9) { t.pago = true; t.dataPagamento = t.vencimento; t.valorPago = t.valor; t.formaPagamento = 'Boleto'; } });

  // conta bancária com extrato recente ainda não conciliado (para demonstrar as sugestões)
  d.bancos = [{ id: 'b1', nome: 'Conta corrente principal', banco: 'Banco Exemplo', agencia: '0001', conta: '12345-6', saldoInicial: 18500, dataSaldo: R.addDays(hoje, -12), ativo: 'Sim' }];
  const ext = (dd, valor, descricao) => d.extrato.push({ id: uid(), bancoId: 'b1', data: R.addDays(hoje, dd), valor: R.r2(valor), descricao, fitid: 'DEMO' + d.extrato.length, documento: '', conciliado: null, importadoEm: new Date().toISOString(), importadoPor: 'Demonstração' });
  const semAcento = s => s.normalize('NFD').replace(/[^\x20-\x7e]/g, '').toUpperCase();
  d.titulos.filter(t => !t.pago).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 4).forEach((t, k) => {
    const c = d.clientes.find(x => x.id === t.clienteId);
    ext(-10 + k * 2, t.valor, k % 2 ? `PIX RECEBIDO ${semAcento(c.razao).slice(0, 24)}` : `LIQUIDACAO BOLETO ${semAcento(c.fantasia)} ${c.cnpj.replace(/\D/g, '').slice(0, 8)}`);
  });
  d.pagar.filter(t => !t.pago && t.vencimento <= R.addDays(hoje, 3)).slice(0, 3).forEach((t, k) => ext(-9 + k * 3, -t.valor, `PAGTO BOLETO ${semAcento(t.descricao).slice(0, 26)}`));
  ext(-8, -59.9, 'TARIFA PACOTE DE SERVICOS'); ext(-3, -12.5, 'TARIFA PIX ENVIADO'); ext(-1, 43.17, 'RENDIMENTO APLIC AUTOMATICA');

  // roteiro de visitas: localização, dia da semana e frequência de cada cliente
  const geo = { 'São Paulo': [-23.5614, -46.6559], 'Guarulhos': [-23.4628, -46.5333], 'Campinas': [-22.9056, -47.0608], 'Osasco': [-23.5329, -46.7917],
    'Santo André': [-23.6639, -46.5383], 'Jundiaí': [-23.1857, -46.8978], 'Mogi das Cruzes': [-23.5228, -46.1883] };
  d.clientes.forEach((c, i) => {
    const g = geo[c.cidade] || geo['São Paulo'];
    Object.assign(c, { lat: +(g[0] + (i % 3) * 0.004).toFixed(6), lng: +(g[1] - (i % 2) * 0.005).toFixed(6), diaVisita: String(1 + (i % 5)), frequencia: [7, 7, 14, 7, 14, 7, 28, 7][i] });
  });
  // últimas 3 semanas de visitas (realizadas com check-in) + a agenda de hoje
  for (let dd = -21; dd <= 0; dd++) {
    const dia = R.addDays(hoje, dd);
    const doDia = d.clientes.filter(c => String(R.diaSemana(dia)) === c.diaVisita);
    const extras = dd === 0 ? d.clientes.filter(c => !doDia.includes(c)).slice(0, 4) : []; // garante agenda hoje para a demonstração
    [...doDia, ...extras].forEach((c, k) => {
      if (dd < 0 && c.frequencia > 7 && Math.abs(dd) % c.frequencia > 6) return;
      const v = { id: uid(), vendedorId: c.vendedorId, clienteId: c.id, data: dia, hora: '', ordem: k + 1, status: 'Agendada', obs: '', objetivo: '', criadoPor: 'Roteiro', criadoEm: new Date().toISOString() };
      if (dd < 0) {
        const ini = new Date(dia + 'T' + String(8 + k).padStart(2, '0') + ':' + String(10 + (k * 13) % 40).padStart(2, '0') + ':00-03:00');
        const longe = Math.random() < 0.12, sorteio = Math.random();
        if (sorteio < 0.1) { v.status = 'Não realizada'; v.resultado = 'Cliente fechado'; v.checkout = { em: ini.toISOString(), por: 'Demonstração' }; }
        else {
          const lat = c.lat + (longe ? 0.02 : (Math.random() - 0.5) * 0.0008), lng = c.lng + (longe ? 0.02 : (Math.random() - 0.5) * 0.0008);
          v.checkin = { em: ini.toISOString(), por: 'Demonstração', lat, lng, precisao: 15, distancia: R.distancia(lat, lng, c.lat, c.lng) };
          v.checkout = { em: new Date(ini.getTime() + (12 + Math.random() * 30) * 60e3).toISOString(), por: 'Demonstração' };
          v.status = 'Realizada';
          const ped = d.pedidos.find(p => p.clienteId === c.id && p.data === dia && !p.visitaId);
          if (ped) { v.pedidoId = ped.id; ped.visitaId = v.id; v.resultado = 'Pedido realizado'; }
          else v.resultado = R.MOTIVOS_SEM_PEDIDO[Math.floor(Math.random() * 4)];
        }
      }
      d.visitas.push(v);
    });
  }

  d.usuarios = [
    { id: 'u1', nome: 'Administrador', email: 'admin@distribpro.local', senha: hashSenha('admin123'), papel: 'admin', vendedorId: '', clienteId: '', ativo: 'Sim' },
    { id: 'u2', nome: 'Carlos Mendes', email: 'carlos@distribpro.local', senha: hashSenha('123456'), papel: 'vendedor', vendedorId: 'v1', clienteId: '', ativo: 'Sim' },
    { id: 'u3', nome: 'Ana Ribeiro', email: 'ana@distribpro.local', senha: hashSenha('123456'), papel: 'vendedor', vendedorId: 'v2', clienteId: '', ativo: 'Sim' },
    { id: 'u4', nome: 'Compras Bom Preço', email: 'compras@bompreco.com.br', senha: hashSenha('123456'), papel: 'cliente', vendedorId: '', clienteId: 'cl1', ativo: 'Sim' },
  ];
  return d;
}

module.exports = { seedDemo, baseVazia };
