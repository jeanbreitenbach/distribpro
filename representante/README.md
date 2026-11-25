# RepCRM — CRM para representante comercial

CRM web para quem trabalha com **representação comercial**: você vende para os clientes em nome de várias **representadas** (fábricas, indústrias), passa o pedido para elas e recebe **comissão** quando faturam ou quando o cliente paga.

Mesma base técnica do DistribPro: **sem dependências**, só precisa do Node.js 22.13 ou superior. O banco (SQLite) já vem no Node.

## Versão online (sem servidor)

O RepCRM também roda como uma página na sua conta Claude, com os dados guardados ali mesmo. Não precisa de hospedagem nem de login próprio: https://claude.ai/artifact/WAUmo4P1S5pNbELUotW9Bt

Ela tem duas **carteiras separadas, Mayrink e TRAC**, que se troca no topo da tela. Cada carteira é um CRM completo, com os próprios clientes, representadas, produtos, funil, agenda, pedidos, comissões e dados no pedido impresso. A carteira usada por último fica lembrada no aparelho.

Essa versão é montada a partir deste mesmo código por `python3 artifact/build.py`, que gera `artifact/repcrm.html`. Nela, o pedido impresso é baixado como arquivo para abrir e imprimir, e não há usuários e senhas, porque o acesso é o da conta Claude (para dar acesso a uma assistente, use *Compartilhar* na página).

## App para Android (APK)

`android/RepCRM.apk` instala o RepCRM no celular com ícone próprio. O app abre a versão online numa tela cheia do Chrome, usando o login do Claude que já está no Chrome. Seus dados continuam na conta Claude.

Para instalar: baixe o arquivo no celular, abra-o e permita *instalar apps desta fonte* quando o Android pedir. Para gerar de novo: `ANDROID_HOME=/caminho/do/sdk android/build.sh` (os ícones vêm de `node android/icones.js`).

## Como rodar

```bash
cd representante
node server.js
```

Abra http://localhost:3100 e entre com **admin@repcrm.local / admin123**. Na primeira execução ele cria `data/repcrm.db` com dados de demonstração. Troque a senha em *Configurações*. Para começar sem os dados de demonstração, use *Configurações → Apagar tudo e começar do zero*.

## O que tem

| Tela | Para que serve |
|---|---|
| **Painel** | Faturado no mês × meta, pedidos do mês, comissão a receber (e atrasada), funil em aberto, o que fazer hoje, faturamento dos últimos 12 meses, **clientes para reativar** e aniversários dos contatos |
| **Agenda** | Ligações, WhatsApp, visitas, e-mails, reuniões e tarefas, separadas em atrasadas, hoje e próximos dias. Ao **concluir**, você registra o resultado e já agenda o próximo contato (2 dias, 1 semana, 15 ou 30 dias) |
| **Funil de vendas** | Quadro (kanban) Prospecção → Qualificação → Proposta → Negociação → Ganha/Perdida. Dá para arrastar os cartões ou usar o menu de cada um, no celular. Perda exige motivo, e a oportunidade ganha vira pedido com um clique |
| **Clientes** | Carteira com situação (prospect, ativo, inativo), último pedido e vendas em 12 meses. A **ficha do cliente** traz o histórico completo (atividades + pedidos), total comprado, ticket médio e de quais representadas ele compra, além de botões de WhatsApp, ligar, e-mail e mapa |
| **Pedidos** | Pedido por representada, com itens da tabela de preços, desconto por item e geral, IPI e % de comissão por item. Fluxo **Orçamento → Enviado → Faturado → Entregue** (ou Cancelado). Tem impressão/PDF com seus dados e campo de assinatura, envio do resumo pelo WhatsApp, e-mail para a representada e "repetir pedido" com os preços atuais. Avisa quando o pedido fica abaixo do mínimo da representada |
| **Comissões** | As parcelas aparecem quando o pedido é faturado. Mostra atrasadas, a vencer no mês e no próximo e as previstas (pedidos ainda não faturados). A baixa pode ser em lote e aceita valor diferente do previsto (ex.: desconto de devolução), e o recebimento pode ser estornado |
| **Relatórios** | Vendas por representada, **curva ABC de clientes**, vendas por mês e por produto, conversão do funil e motivos de perda. Tudo exporta para CSV (abre no Excel) |
| **Representadas** | Comissão padrão, **regra de pagamento da comissão**, meta mensal, pedido mínimo, condição padrão, contatos e cor |
| **Produtos e preços** | Catálogo por representada. **Importa a tabela de preços em CSV**: reconhece as colunas sozinho e atualiza pelo código, o que é útil quando chega tabela nova com reajuste |
| **Configurações** | Seus dados (saem no pedido impresso), senha, usuários extras (ex.: assistente), backup e restauração |

### Como a comissão é calculada

- A base é o valor da mercadoria **sem IPI**, depois dos descontos. Cada item tem o seu %: vem do produto, se ele tiver um % próprio, ou senão da representada, e pode ser alterado no pedido.
- Se a representada faturou **menos do que o pedido** (corte, falta de estoque), informe o *valor faturado* e a comissão fica proporcional.
- A **regra de pagamento** é definida em cada representada:
  - **Sobre o faturamento**: uma parcela, paga X dias depois do faturamento.
  - **Sobre o pagamento do cliente (liquidez)**: uma parcela para cada vencimento do cliente (condição `30/60/90` → 3 parcelas), paga X dias depois de cada vencimento.
- Um pedido com comissão já recebida fica travado para edição e cancelamento. Para alterá-lo, estorne o recebimento antes.

## App no celular

Publicado com HTTPS, dá para instalar o RepCRM como app: no Android, pelo Chrome, em *⋮ → Instalar app*; no iPhone, pelo Safari, em *Compartilhar → Adicionar à Tela de Início*. As telas foram feitas para funcionar no celular. Ao contrário do DistribPro, o RepCRM **precisa de internet** para funcionar.

## Colocar no ar

Funciona do mesmo jeito que o DistribPro (veja o README principal). Com Docker:

```bash
cd representante
docker build -t repcrm .
docker run -d -p 3100:3100 -v repcrm-data:/data -e DADOS_INICIAIS=vazio \
  -e ADMIN_EMAIL=voce@email.com -e ADMIN_SENHA='senha-forte' -e ADMIN_NOME='Seu Nome' -e TRUST_PROXY=1 repcrm
```

No Render, crie um *Web Service* com **Root Directory** = `representante` e *Start Command* = `node server.js`. Adicione um disco em `/var/data`, `DB_FILE=/var/data/repcrm.db` e as variáveis abaixo.

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | 3100 | Porta HTTP |
| `DB_FILE` | `data/repcrm.db` | Caminho do banco |
| `DADOS_INICIAIS` | `demo` | `vazio` para começar sem demonstração |
| `ADMIN_EMAIL` / `ADMIN_SENHA` / `ADMIN_NOME` | admin@repcrm.local / admin123 | Login inicial (só na criação do banco) |
| `BACKUP_DIAS` | 14 | Backups diários mantidos em `data/backups/` (`0` desliga) |
| `TRUST_PROXY` | — | `1` atrás de proxy/HTTPS |

Esqueceu a senha? Rode `node server.js redefinir-senha seu@email.com NovaSenha123` no servidor.

## Testes

```bash
npm test    # testes de ponta a ponta da API: cálculo de comissão, ciclo do pedido, funil, agenda, importação, backup
```

## Estrutura

```
server.js        servidor HTTP, login, API e regras que alteram dados
lib/regras.js    cálculos (totais, IPI, comissão, parcelas), usados no servidor e no navegador
lib/seed.js      dados de demonstração
public/app.js    interface (todas as telas)
tests/           testes da API
```
