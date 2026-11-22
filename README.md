# DistribPro — gestão para distribuidoras

Sistema web multiusuário para distribuidoras, no estilo Demander: pedidos, força de vendas externa, portal B2B do cliente, estoque, contas a receber, relatórios e NF-e.

**Sem dependências:** só precisa do Node.js 22.13 ou superior. O banco de dados (SQLite) já vem embutido no Node.

## Como rodar

```bash
node server.js
```

Abra http://localhost:3000. Na primeira execução o sistema cria o banco `data/distribpro.db` com dados de demonstração.

| Perfil | Login | Senha |
|---|---|---|
| Administrador | admin@distribpro.local | admin123 |
| Vendedor | carlos@distribpro.local | 123456 |
| Cliente (portal B2B) | compras@bompreco.com.br | 123456 |

> Troque as senhas (menu **Minha conta**) antes de usar de verdade. Para começar com o sistema vazio, use **Configurações → Começar do zero**.

## Perfis de acesso

- **Administrador**: acesso total. Faturamento, estoque, financeiro, NF-e, cadastros, usuários e backup.
- **Vendedor**: vê apenas a própria carteira. Faz e aprova pedidos pelo celular, consulta estoque, títulos e a própria meta e comissão. Não vê custos nem margens.
- **Cliente**: portal B2B. Catálogo com os preços da tabela dele, envio de pedidos (chegam como orçamento para a distribuidora aprovar), "repetir último pedido", acompanhamento de pedidos e boletos.

As regras são aplicadas **no servidor**. Por exemplo: o cliente não consegue alterar preço nem desconto, e o vendedor não acessa clientes de outro vendedor.

## Compras, contas a pagar e fluxo de caixa (administrador)

- **Fornecedores**: cadastro com CNPJ, contato, prazo padrão de pagamento e dados de PIX/banco. Mostra o histórico de compras e o que está em aberto com cada um.
- **Compras (NF de entrada)**: ao lançar a nota do fornecedor, o sistema:
  - dá entrada no estoque;
  - recalcula o **custo médio ponderado** dos produtos, com rateio do frete e de outras despesas;
  - gera as **contas a pagar** conforme o prazo (ex.: 28/42 dias).
  - Bloqueia NF duplicada do mesmo fornecedor e tem uma **sugestão de reposição**, que monta a nota com os produtos abaixo do estoque mínimo.
- **Importação do XML da NF-e** (Compras → *Importar XML da NF-e*): lê o arquivo XML que o fornecedor envia e mostra uma tela de conferência antes de lançar.
  - **Fornecedor**: reconhecido pelo CNPJ; se não existir, é cadastrado automaticamente.
  - **Produtos**: reconhecidos pelo vínculo memorizado com o código do fornecedor ou pelo código de barras (EAN). Os que não forem reconhecidos podem ser vinculados a um produto existente ou cadastrados na hora (nome, NCM, EAN e preço de venda por margem).
  - **Conversão de unidade**: compra em fardo/caixa e venda em unidade (ex.: 1 FD = 6 UN). É detectada automaticamente pelo EAN da unidade tributável e pode ser ajustada.
  - **Custo**: valor do item − desconto + IPI + ICMS-ST + seguro/outras despesas. O frete é rateado. A tela destaca variações de custo acima de 5%.
  - **Contas a pagar**: usam as **duplicatas da nota** (datas e valores exatos).
  - **Proteções**: bloqueia a mesma NF-e duas vezes (pela chave de acesso) e avisa se a nota não foi autorizada pela SEFAZ ou se não foi emitida para a sua empresa.
  - Há um XML fictício em `exemplos/nfe-compra-exemplo.xml` para testar com os dados de demonstração.
  - Cancelar a entrada estorna o estoque e remove as parcelas ainda não pagas.
- **Contas a pagar**: despesas avulsas, parceladas (divide o valor) ou **fixas mensais** (repete o valor todo mês: aluguel, folha, internet...). A baixa registra a data, o valor pago (com juros ou desconto) e a forma de pagamento. Tem filtros por situação, categoria, fornecedor e período, e exportação para CSV.
- **Fluxo de caixa**: entradas (a receber) × saídas (a pagar) previstas para 30, 60 ou 90 dias, por semana ou por dia. Informando o saldo atual, mostra o **saldo projetado**. Traz também o realizado dos últimos 30 dias, as despesas por categoria e os valores atrasados.

Vendedores e clientes não têm acesso a nenhuma dessas telas, e a API recusa as chamadas deles.

## Fluxo do pedido

`Orçamento → Aprovado → Em separação → Faturado → Entregue` (ou `Cancelado`)

- Ao **faturar**, o estoque é baixado e os títulos a receber são gerados conforme a condição de pagamento (ex.: 30/60/90). O sistema avisa quando falta estoque ou quando o cliente passa do limite de crédito.
- Ao voltar o status ou cancelar, o estoque é estornado e os títulos que ainda não foram pagos são removidos.
- Cada mudança de status fica registrada no histórico do pedido, com o nome de quem fez e quando.

## NF-e

Por padrão a emissão é **simulada** (gera número e chave fictícios, sem valor fiscal), para testar o fluxo.

Para emitir notas reais, o sistema já vem preparado para a [Focus NFe](https://focusnfe.com.br):

1. Crie uma conta na Focus NFe e cadastre a empresa e o certificado digital A1.
2. Preencha os dados da empresa em **Configurações**, o NCM dos produtos e o endereço completo dos clientes.
3. Inicie o servidor assim:
   ```bash
   NFE_PROVEDOR=focusnfe FOCUS_TOKEN=seu_token FOCUS_AMBIENTE=homologacao node server.js
   ```
4. Teste em `homologacao` e só depois mude para `producao`.

⚠️ As regras tributárias em `lib/nfe.js` (CFOP 5102/6102, CSOSN 102, PIS/COFINS 07) são um ponto de partida para empresas do **Simples Nacional**. **Valide com seu contador.** Produtos com ICMS-ST, empresas do Lucro Presumido ou Real e operações especiais precisam de ajustes. A integração com a Focus NFe ainda não foi testada contra a API real.

## Colocar no ar (para vendedores e clientes acessarem de fora)

### Opção 1: Render (mais fácil, com HTTPS automático)

O repositório já tem o arquivo `render.yaml` configurado.

1. Crie uma conta em https://render.com e conecte sua conta do GitHub.
2. Abra https://render.com/deploy?repo=https://github.com/jeanbreitenbach/distribpro
3. Informe o **ADMIN_EMAIL** e a **ADMIN_SENHA** (mínimo de 8 caracteres) do administrador e clique em **Deploy**.
4. Em cerca de 2 minutos o sistema estará em `https://distribpro-xxxx.onrender.com`. Dá para usar um domínio próprio em *Settings → Custom Domains*.

Custo aproximado: US$ 7/mês (plano Starter) + US$ 0,25/mês (disco de 1 GB). O plano gratuito **não serve**, porque não tem disco e os dados seriam apagados a cada reinício.

O sistema publicado começa **vazio**, só com o administrador. Cadastre produtos, clientes e vendedores, e crie os logins em **Usuários e acessos**.

### Opção 2: servidor próprio / VPS com Docker

```bash
docker build -t distribpro .
docker run -d -p 3000:3000 -v distribpro-data:/data \
  -e DADOS_INICIAIS=vazio -e ADMIN_EMAIL=voce@empresa.com -e ADMIN_SENHA='senha-forte' -e TRUST_PROXY=1 \
  --name distribpro distribpro
```

Coloque um proxy com **HTTPS** na frente (Caddy, Nginx). Sem HTTPS, as senhas trafegam abertas pela internet.

**Backup:** copie o arquivo do banco (no Render: o disco `/var/data`; no Docker: o volume `/data`) periodicamente, ou use **Configurações → Baixar backup**.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | 3000 | Porta HTTP |
| `DB_FILE` | `data/distribpro.db` | Caminho do banco SQLite |
| `NFE_PROVEDOR` | `simulado` | `simulado` ou `focusnfe` |
| `FOCUS_TOKEN` | — | Token da API Focus NFe |
| `FOCUS_AMBIENTE` | `homologacao` | `homologacao` ou `producao` |
| `DADOS_INICIAIS` | `demo` | `vazio` para começar sem dados de demonstração (só na criação do banco) |
| `ADMIN_EMAIL` | admin@distribpro.local | Login do administrador inicial (só na criação do banco) |
| `ADMIN_SENHA` | admin123 | Senha do administrador inicial, mín. 8 caracteres (só na criação do banco) |
| `TRUST_PROXY` | — | `1` quando estiver atrás de proxy/HTTPS, para identificar o IP real no bloqueio de login |

## Estrutura

```
server.js          servidor HTTP, autenticação, permissões e API
lib/regras.js      regras de negócio (compartilhadas com o navegador)
lib/nfe.js         emissão de NF-e (simulada / Focus NFe)
public/financeiro.js  fornecedores, compras, contas a pagar e fluxo de caixa
lib/seed.js        dados de demonstração
public/            interface web (HTML/CSS/JS, sem build)
exemplos/          XML de NF-e fictício para testar a importação
data/              banco SQLite (criado automaticamente)
```

## Limitações conhecidas

- Todos os dados são mantidos em memória e gravados no SQLite. Funciona bem até algumas dezenas de milhares de pedidos; acima disso, o ideal é migrar para PostgreSQL com consultas paginadas.
- O navegador recebe a base inteira do perfil a cada atualização (atualiza sozinho a cada 30 s).
- Ainda não tem: emissão de boletos, conciliação bancária, busca automática das notas na SEFAZ (manifestação do destinatário), app offline para o vendedor, cancelamento de NF-e pelo sistema.
