# DistribPro — gestão para distribuidoras

Sistema web multiusuário para distribuidoras, no estilo Demander: pedidos, força de vendas externa, portal B2B do cliente, estoque, contas a receber, relatórios e NF-e.

**Sem dependências:** só precisa do Node.js 22.5 ou superior. O banco de dados (SQLite) já vem embutido no Node.

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

Qualquer servidor ou VPS com Node 22 serve. Com Docker:

```bash
docker build -t distribpro .
docker run -d -p 3000:3000 -v distribpro-data:/data --name distribpro distribpro
```

Coloque um proxy com **HTTPS** na frente (Caddy, Nginx ou o próprio provedor). Sem HTTPS, as senhas trafegam abertas pela internet.

**Backup:** copie o arquivo `data/distribpro.db` (ou o volume `/data`) periodicamente, ou use **Configurações → Baixar backup**.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | 3000 | Porta HTTP |
| `DB_FILE` | `data/distribpro.db` | Caminho do banco SQLite |
| `NFE_PROVEDOR` | `simulado` | `simulado` ou `focusnfe` |
| `FOCUS_TOKEN` | — | Token da API Focus NFe |
| `FOCUS_AMBIENTE` | `homologacao` | `homologacao` ou `producao` |

## Estrutura

```
server.js          servidor HTTP, autenticação, permissões e API
lib/regras.js      regras de negócio (compartilhadas com o navegador)
lib/nfe.js         emissão de NF-e (simulada / Focus NFe)
lib/seed.js        dados de demonstração
public/            interface web (HTML/CSS/JS, sem build)
data/              banco SQLite (criado automaticamente)
```

## Limitações conhecidas

- Todos os dados são mantidos em memória e gravados no SQLite. Funciona bem até algumas dezenas de milhares de pedidos; acima disso, o ideal é migrar para PostgreSQL com consultas paginadas.
- O navegador recebe a base inteira do perfil a cada atualização (atualiza sozinho a cada 30 s).
- Ainda não tem: contas a pagar, compras e fornecedores, emissão de boletos, app offline para o vendedor, cancelamento de NF-e pelo sistema.
