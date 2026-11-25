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

## Catálogo interativo (público, com carrinho e WhatsApp)

Endereço: **`/catalogo`** (ex.: `https://seu-sistema.onrender.com/catalogo`). Não precisa de login: é para mandar aos clientes. Também abre pelo botão **🛒 Ver catálogo** na tela *Produtos*.

- **Produtos da Linha Varejo** (Idealpan, Tia Tânia, Mix, Empanados, Dona Creuza e Low Price), com busca e filtro por linha.
- **Clicar no produto** abre a janela com foto, embalagem, peso da unidade, **tabela nutricional**, modo de preparo e conservação. Cada produto tem link próprio (`/catalogo#CODIGO`, ex.: `/catalogo#IP-TRAD-2KG`), bom para mandar no WhatsApp.
- Botões **Solicitar orçamento** e **Fazer pedido**, que abrem o WhatsApp **(48) 99941-0749** com a mensagem pronta para o Rafael.
- **Carrinho**: guarda os itens no aparelho, calcula o total estimado e envia o pedido ou o orçamento completo pelo WhatsApp, com os dados do cliente (nome, CNPJ/CPF, cidade, telefone e observações).
- **Preço e estoque ao vivo**: vêm do cadastro de produtos do DistribPro, pelo **código** do produto (ex.: `IP-TRAD-2KG`), e se atualizam a cada minuto. Use **Produtos → Cadastrar itens do catálogo** para criar de uma vez os produtos que faltam (entram com preço e estoque zerados) e depois preencha preço e estoque. Produto sem preço aparece como *Preço sob consulta*, com o botão *Consultar preço e estoque com o Rafael*.
- **Integração com o Mercos**: com os tokens do Mercos configurados, o catálogo passa a mostrar **preço e estoque do Mercos** em vez dos do DistribPro. O servidor lê os produtos pela API do Mercos (só leitura, nada é gravado lá) a cada 5 minutos.
  - **Configurar** (no Render: *Environment*): `MERCOS_APPLICATION_TOKEN` e `MERCOS_COMPANY_TOKEN`, que são pedidos ao suporte do Mercos para integração via API. Opcionais: `MERCOS_TABELA_ID` (usa os preços dessa tabela de preço do Mercos), `MERCOS_AMBIENTE=sandbox` para testes e `MERCOS_INTERVALO_MIN`.
  - **Vínculo dos produtos**: automático pelo código do Mercos anotado em `lib/catalogo.js` (ex.: Tradicional 2 kg = 13) ou quando o código é igual ao do catálogo. Preço com unidade KG no Mercos é tratado como preço por quilo: o catálogo mostra o preço do kg; o total do carrinho e a mensagem do WhatsApp calculam pelos quilos (pacotes × peso do pacote). Os outros são escolhidos em **Produtos → 🔗 Mercos**, que também mostra a situação da conexão e tem o botão *Ler o Mercos agora*.
  - Produto excluído ou inativo no Mercos some do catálogo (fica *Preço sob consulta*). Sem controle de estoque no Mercos, aparece só o preço. *Últimas unidades* = até `CATALOGO_ESTOQUE_BAIXO` (padrão 10).
  - ⚠️ Feita conforme a API v1 do Mercos (cabeçalhos `ApplicationToken`/`CompanyToken`, `/v1/produtos` e `/v1/produtos_tabela_preco` com `alterado_apos`) e testada contra um Mercos simulado. Confira com os tokens reais, de preferência primeiro no sandbox.
- O catálogo nunca mostra custo nem margem. `CATALOGO_PRECOS=nao` esconde os preços; `CATALOGO_ESTOQUE=situacao` mostra só *Disponível / Últimas unidades / Esgotado*; `CATALOGO_ESTOQUE=nao` esconde o estoque.
- **Editar o catálogo** (número do WhatsApp, nome do atendente, produtos, tabelas nutricionais): arquivo `lib/catalogo.js`. Fotos em `public/catalogo/img/`.

**Tabelas nutricionais**: as da Idealpan, Dona Creuza e Tinô foram copiadas do site oficial (www.idealpan.com.br), junto com ingredientes, alérgicos e modo de preparo. Elas mostram o link da fonte. As da **Tia Tânia** ainda são valores de **referência** e aparecem com aviso, porque o site tiatania.com.br não respondeu. Quando tiver a tabela da embalagem, copie-a para `lib/catalogo.js` e marque `confirmada: true`.

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
- **Bancos e conciliação**: cadastro das contas bancárias (saldo inicial + extrato = saldo atual) e importação do **extrato OFX**, que todo banco exporta no internet banking.
  - **Formatos aceitos**: OFX 1.x (SGML) e 2.x (XML), Latin-1 ou UTF-8, vírgula ou ponto decimal.
  - **Repetições**: lançamentos já importados são ignorados (pelo FITID), e o saldo informado pelo banco é comparado com o calculado.
  - **Sugestões**: para cada lançamento, o sistema sugere o título correspondente (mesmo valor, vencimento próximo, nome ou CNPJ na descrição) e tem o botão **Conciliar todos automaticamente**.
  - **Conciliação manual**: aceita vários títulos para um lançamento (ex.: cliente pagou dois boletos num PIX) e diferença de juros ou desconto.
  - **Ao conciliar**: os títulos recebem baixa na data do extrato. Tarifas, IOF e despesas sem título viram despesa paga com categoria. Rendimentos, transferências e aportes ficam classificados.
  - **Desfazer**: reabre só o que a conciliação baixou.
  - Há um extrato fictício em `exemplos/extrato-exemplo.ofx`.
- **Fluxo de caixa**: entradas (a receber) × saídas (a pagar) previstas para 30, 60 ou 90 dias, por semana ou por dia. Parte da soma dos saldos bancários (ou de um saldo digitado) e mostra o **saldo projetado**. Traz também o realizado dos últimos 30 dias, as despesas por categoria e os valores atrasados.

Vendedores e clientes não têm acesso a nenhuma dessas telas, e a API recusa as chamadas deles.

## App no celular e modo offline (força de vendas)

O DistribPro pode ser **instalado no celular** como um app, sem passar por loja de aplicativos (precisa estar publicado com HTTPS):

- **Android (Chrome)**: abra o endereço do sistema e toque em **📲 Instalar app**, no menu lateral, ou em *⋮ → Instalar app*.
- **iPhone (Safari)**: toque em *Compartilhar → Adicionar à Tela de Início*.

**Sem internet**, o app continua funcionando com a última cópia dos dados baixada no aparelho: carteira de clientes, catálogo com preços de cada cliente, pedidos e títulos.

- Os pedidos feitos sem sinal ficam salvos no aparelho, com o selo **offline**, e são **enviados sozinhos** quando a conexão volta. Também dá para enviar pelo botão *Enviar agora*.
- Cada pedido offline leva um identificador único, então **um reenvio nunca duplica o pedido** no servidor, mesmo que a conexão caia no meio do envio.
- Se o servidor recusar um pedido (ex.: cliente inativado nesse meio-tempo), ele continua no aparelho com o motivo, para o vendedor corrigir ou excluir.
- Ações que dependem do servidor (aprovar, faturar, financeiro) pedem internet.
- Ao clicar em *Sair*, a cópia local dos dados é apagada do aparelho. Pedidos ainda não enviados continuam guardados e sobem no próximo login do mesmo usuário.

## Agenda de visitas e check-in (força de vendas)

- **Roteiro**: cada cliente tem **dia de visita** e **frequência** (semanal, quinzenal, mensal). O botão *Gerar roteiro* agenda as visitas do período respeitando a frequência a partir da última visita, sem duplicar. Também dá para agendar visitas avulsas, com horário e objetivo.
- **Agenda do dia** (pensada para o celular): ordem das visitas (reordenável), rota no Google Maps com as visitas pendentes, endereço e telefone, última compra e alerta de títulos vencidos.
- **Check-in com GPS**: registra a hora e a **distância até o cliente**. Check-ins a mais de 300 m são sinalizados. No primeiro check-in de um cliente sem localização, a posição pode ser salva como a dele.
- **Pedido na visita**: o botão *Fazer pedido* liga o pedido à visita. Ao encerrar, a visita sem pedido exige o **motivo** (estoque abastecido, comprou da concorrência, responsável ausente...). Também é possível registrar a visita como não realizada.
- **Funciona sem internet**: check-in, pedido e encerramento entram na mesma fila offline dos pedidos e são enviados na ordem certa quando a conexão volta.
- **Relatório de visitas** (gestor): planejadas × realizadas, % de execução do roteiro, **positivação** (visitas que viraram pedido), tempo médio de visita, motivos de visita sem pedido e check-ins a conferir (longe do cliente ou sem GPS).
- O vendedor vê apenas a própria agenda. O administrador vê e agenda para todos.

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

## Operação e manutenção

- **Backup automático**: todo dia o servidor grava uma cópia consistente do banco em `data/backups/` (no Render: `/var/data/backups/`) e mantém os últimos 14 dias. Para restaurar, pare o servidor e copie o arquivo do dia desejado sobre `distribpro.db`. Também há o backup manual em **Configurações → Baixar backup**.
- **Esqueceu a senha do administrador?** Rode no servidor (no Render: aba *Shell*):
  ```bash
  node server.js redefinir-senha admin@suaempresa.com.br NovaSenhaForte123
  ```
  Funciona com o servidor ligado e encerra as sessões antigas daquele usuário.
- **Fuso horário**: datas de pedidos, faturamento e vencimentos usam o horário de Brasília (`TZ=America/Sao_Paulo`), mesmo em servidores de nuvem que rodam em UTC.
- **Atualizações**: com o Render ligado ao GitHub, cada envio para a branch `main` publica a nova versão sozinho. O desligamento é seguro (não perde dados) e o app no celular pega a versão nova na próxima abertura com internet.
- **Segurança**: senhas com hash *scrypt*; sessões assinadas que expiram em 7 dias e caem ao trocar a senha; bloqueio temporário após 8 senhas erradas para o mesmo e-mail (ou 40 do mesmo IP); permissões checadas no servidor; operações que falham no meio não deixam dados pela metade.

## Testes automáticos

```bash
npm test          # 24 testes de ponta a ponta da API (inclui o Mercos simulado) (todos os módulos e permissões)
npm run test:ui   # abre todas as telas e janelas dos 3 perfis no computador e no celular (requer Playwright)
```

Os testes sobem um servidor temporário com dados de demonstração. Não mexem no seu banco. Eles também rodam sozinhos no GitHub a cada envio (aba *Actions*).

## Checklist para colocar em produção

O que **já está pronto** no sistema: todos os módulos, os testes, o backup e a publicação configurada (`render.yaml`/Docker). O que **depende de você**:

1. **Publicar** (≈ 10 min): criar a conta no Render e clicar no link de deploy da seção *Colocar no ar*, informando `ADMIN_EMAIL` e `ADMIN_SENHA`. Custo aproximado de US$ 7,25/mês.
2. **Dados da empresa** em *Configurações* (razão social, CNPJ, IE, endereço). O CNPJ é usado para conferir as NF-e de compra e como emitente das notas.
3. **Cadastros iniciais**: produtos (com NCM, para emitir NF-e), clientes (com endereço, dia e frequência de visita), vendedores, tabelas de preço e condições de pagamento, contas bancárias com o saldo inicial.
4. **Logins** em *Usuários e acessos*: um por vendedor e, se quiser o portal B2B, um por cliente.
5. **NF-e real** (opcional; sem isso as notas ficam em modo simulado):
   1. Contratar a Focus NFe (ou outro emissor por API).
   2. Enviar o **certificado digital A1** da empresa para eles.
   3. **Validar com o contador** CFOP, CST/CSOSN e impostos em `lib/nfe.js`, que hoje seguem o padrão do Simples Nacional.
   4. Configurar `NFE_PROVEDOR=focusnfe`, `FOCUS_TOKEN` e `FOCUS_AMBIENTE=homologacao`, testar e só então passar para `producao`.
6. **Testar com arquivos reais**: importar 2 ou 3 XML de compra e um extrato OFX do seu banco, conferindo a tela antes de confirmar.
7. **Instalar o app no celular** de um vendedor e fazer uma visita de teste, inclusive sem internet.

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
| `TZ` | `America/Sao_Paulo` | Fuso horário das datas do sistema |
| `BACKUP_DIAS` | `14` | Quantos backups diários manter (`0` desliga) |
| `BACKUP_DIR` | `data/backups` | Pasta dos backups automáticos |
| `CATALOGO_PRECOS` | `sim` | `nao` esconde os preços no catálogo público |
| `CATALOGO_ESTOQUE` | `quantidade` | `situacao` (só disponível/esgotado) ou `nao` (esconde) no catálogo público |
| `MERCOS_APPLICATION_TOKEN` | — | Token da aplicação no Mercos (liga a integração) |
| `MERCOS_COMPANY_TOKEN` | — | Token da empresa no Mercos |
| `MERCOS_TABELA_ID` | — | Tabela de preço do Mercos usada no catálogo (padrão: preço de tabela do produto) |
| `MERCOS_AMBIENTE` | `producao` | `sandbox` para testar |
| `MERCOS_INTERVALO_MIN` | `5` | Minutos entre as leituras do Mercos |
| `CATALOGO_ESTOQUE_BAIXO` | `10` | Estoque do Mercos que mostra *Últimas unidades* |
| `TRUST_PROXY` | — | `1` quando estiver atrás de proxy/HTTPS, para identificar o IP real no bloqueio de login |

## Estrutura

```
server.js          servidor HTTP, autenticação, permissões e API
lib/regras.js      regras de negócio (compartilhadas com o navegador)
lib/nfe.js         emissão de NF-e (simulada / Focus NFe)
public/financeiro.js  fornecedores, compras, contas a pagar e fluxo de caixa
public/bancos.js   contas bancárias, extrato OFX e conciliação
public/visitas.js  agenda de visitas, roteiro, check-in e relatório de visitas
public/offline.js  modo offline: cópia local dos dados e fila de pedidos/visitas
public/sw.js       service worker (abre o app sem internet)
lib/seed.js        dados de demonstração
lib/mercos.js      leitura de produtos, preços e estoque do Mercos (API)
lib/catalogo.js    produtos, nutrição e WhatsApp do catálogo público (/catalogo)
public/catalogo*   página do catálogo, carrinho e fotos
public/            interface web (HTML/CSS/JS, sem build)
exemplos/          XML de NF-e e extrato OFX fictícios para testar as importações
data/              banco SQLite (criado automaticamente)
```

## Limitações conhecidas

- Todos os dados são mantidos em memória e gravados no SQLite. Funciona bem até algumas dezenas de milhares de pedidos; acima disso, o ideal é migrar para PostgreSQL com consultas paginadas.
- O navegador recebe a base inteira do perfil a cada atualização (atualiza sozinho a cada 30 s).
- Ainda não tem: emissão de boletos, integração direta com a API dos bancos (Open Finance), busca automática das notas na SEFAZ (manifestação do destinatário), cancelamento de NF-e pelo sistema.
