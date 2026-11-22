/* Dados de demonstração */
const R = require('./regras');

function baseVazia() {
  return {
    empresa: { nome: 'Minha Distribuidora Ltda', fantasia: 'Minha Distribuidora', cnpj: '00.000.000/0001-00', ie: '', telefone: '(11) 4000-0000', email: 'contato@minhadistribuidora.com.br',
      logradouro: 'Av. Central', numero: '1000', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', cep: '01000-000', regime: '1' },
    seq: { pedido: 1000, nfe: 0 },
    produtos: [], clientes: [], vendedores: [], pedidos: [], movimentos: [], titulos: [], usuarios: [],
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

  d.usuarios = [
    { id: 'u1', nome: 'Administrador', email: 'admin@distribpro.local', senha: hashSenha('admin123'), papel: 'admin', vendedorId: '', clienteId: '', ativo: 'Sim' },
    { id: 'u2', nome: 'Carlos Mendes', email: 'carlos@distribpro.local', senha: hashSenha('123456'), papel: 'vendedor', vendedorId: 'v1', clienteId: '', ativo: 'Sim' },
    { id: 'u3', nome: 'Ana Ribeiro', email: 'ana@distribpro.local', senha: hashSenha('123456'), papel: 'vendedor', vendedorId: 'v2', clienteId: '', ativo: 'Sim' },
    { id: 'u4', nome: 'Compras Bom Preço', email: 'compras@bompreco.com.br', senha: hashSenha('123456'), papel: 'cliente', vendedorId: '', clienteId: 'cl1', ativo: 'Sim' },
  ];
  return d;
}

module.exports = { seedDemo, baseVazia };
