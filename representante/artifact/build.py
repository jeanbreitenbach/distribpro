#!/usr/bin/env python3
"""Monta artifact/repcrm.html (versão publicada no claude.ai) a partir do código do RepCRM.
Uso: python3 representante/artifact/build.py
As regras de negócio vêm do server.js e o app do public/app.js; aqui só se adapta o que muda no claude.ai:
sem login (o acesso é o da sua conta Claude), dados no banco da página, diálogos dentro da página e downloads pelo Claude."""
import pathlib, re

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parent
ler = lambda p: (RAIZ / p).read_text(encoding='utf-8')

def trecho(txt, ini, fim):
    a = txt.index(ini); b = txt.index(fim, a)
    return txt[a:b]

def troca(txt, velho, novo, n=1):
    assert txt.count(velho) == n, f'esperava {n}x: {velho[:80]!r} (achei {txt.count(velho)})'
    return txt.replace(velho, novo)

server = ler('server.js')
regras_srv = trecho(server, '/* ================= Cadastros (campos permitidos)', '/* ================= HTTP')
rotas_srv = trecho(server, "rota('POST', '/api/oportunidades/:id/etapa'", 'const qVersao')
seed = ler('lib/seed.js')
seed = troca(seed, "'use strict';\nconst R = require('./regras');\n", '')
seed = troca(seed, 'module.exports = { seedDemo, baseVazia };\n', '')

backend = (AQUI / 'backend.js').read_text(encoding='utf-8')
backend = troca(backend, '/*@@SEED@@*/', seed)
backend = troca(backend, '/*@@REGRAS@@*/', regras_srv)
backend = troca(backend, '/*@@ROTAS@@*/', rotas_srv)

app = ler('public/app.js')
subs = [
    ("let db = null, token = null, page = '', state = {};\ntry { token = localStorage.getItem('rc_token'); } catch (e) { }\n", "let db = null, page = '', state = {};\n"),
    # api → backend local
    (app[app.index('async function api('):app.index('/** Executa no servidor')],
     "async function api(method, url, body) { const j = await Backend.chamar(method, url, body); db = Backend.dados(); return j; }\n"),
    ("catch (e) { if (e.status !== 401) alert(e.message); return null; }", "catch (e) { aviso(e.message); return null; }"),
    ("function setToken(t) { token = t; try { t ? localStorage.setItem('rc_token', t) : localStorage.removeItem('rc_token'); } catch (e) { } }\n", ""),
    ("function sair(expirou) { setToken(null); db = null; closeModal(); telaLogin(expirou ? 'Sua sessão expirou. Entre novamente.' : ''); }\n", ""),
    (app[app.index('/* ================== LOGIN'):app.index('/* ================== LAYOUT')], ''),
    ("${esc(db.config.empresa || '')}<br><a class=\"lnk\" onclick=\"sair()\">Sair</a></div>", "${esc(db.config.empresa || '')}</div>"),
    # diálogos (alert/confirm/prompt não funcionam no claude.ai)
    ("  if (!confirm('Excluir este registro?' + extra)) return;", "  if (!(await confirmar('Excluir este registro?' + extra, 'Excluir'))) return;"),
    ("motivoPerda = prompt('Por que perdeu esta oportunidade? (preço, prazo, concorrente, sem verba...)', o.motivoPerda || '');",
     "motivoPerda = await perguntar('Por que perdeu esta oportunidade? (preço, prazo, concorrente, sem verba...)', o.motivoPerda || '');"),
    ("if (etapa === 'Ganha' && !o.pedidoId && confirm('Oportunidade ganha! Quer já lançar o pedido?'))",
     "if (etapa === 'Ganha' && !o.pedidoId && await confirmar('Oportunidade ganha! Quer já lançar o pedido?', 'Lançar pedido'))"),
    ("{ alert('Cadastre primeiro uma representada (menu Cadastros → Representadas).'); return go('representadas'); }",
     "{ go('representadas'); return aviso('Cadastre primeiro uma representada: a empresa que você representa.'); }"),
    ("return alert('Este pedido já tem comissão recebida", "return aviso('Este pedido já tem comissão recebida"),
    ("function trocarRep(id) {", "async function trocarRep(id) {"),
    ("&& !confirm('Os produtos da outra representada serão removidos do pedido. Continuar?'))",
     "&& !(await confirmar('Os produtos da outra representada serão removidos do pedido. Continuar?', 'Trocar')))"),
    ("function addItem(txt) {", "async function addItem(txt) {"),
    ("if (!confirm(`Produto \"${txt}\" não encontrado no cadastro. Incluir como item avulso?`)) return;",
     "if (!(await confirmar(`Produto \"${txt}\" não está no cadastro. Incluir como item avulso?`, 'Incluir'))) return;"),
    ("function mudarStatus(id, status, ajuste) {", "async function mudarStatus(id, status, ajuste) {"),
    ("if (status === 'Cancelado' && !confirm('Cancelar este pedido?' + (R.faturado(p) ? ' As comissões previstas dele serão removidas.' : ''))) return;",
     "if (status === 'Cancelado' && !(await confirmar('Cancelar este pedido?' + (R.faturado(p) ? ' As comissões previstas dele serão removidas.' : ''), 'Cancelar pedido'))) return;"),
    ("if (confirm('Excluir este pedido definitivamente?') &&", "if (await confirmar('Excluir este pedido definitivamente?', 'Excluir') &&"),
    ("function estornar(pedidoId, n) { if (confirm('Estornar o recebimento desta comissão?'))",
     "async function estornar(pedidoId, n) { if (await confirmar('Estornar o recebimento desta comissão?', 'Estornar'))"),
    ("return alert('Cadastre a representada primeiro.');", "return aviso('Cadastre a representada primeiro.');"),
    # impressão: window.print() não funciona na página publicada → baixa um arquivo que abre e imprime
    ("<button class=\"btn sm\" onclick=\"window.print()\">🖨 Imprimir / PDF</button>",
     "<button class=\"btn sm\" onclick=\"baixarPedido('${id}')\">🖨 Baixar para imprimir / PDF</button>"),
    ("<button class=\"btn\" onclick=\"window.print()\">🖨 Imprimir</button>", ""),
    # downloads pelo Claude
    (app[app.index('function baixarArquivo('):app.index('function csv(')],
     """async function baixarArquivo(nome, conteudo) {
  const dl = await claude.use('downloads');
  if (!dl) return aviso('Este aparelho não permite baixar arquivos por aqui. Abra a página no navegador do computador.');
  try { await dl.save({ filename: nome, data: conteudo }); } catch (e) { if (e && e.code !== 'declined') aviso('Não foi possível baixar o arquivo (' + (e.message || e.code) + ').'); }
}
function baixarPedido(id) {
  const p = byId('pedidos', id), doc = document.querySelector('#modal .print-doc'); if (!doc) return;
  const css = document.querySelector('style').textContent;
  baixarArquivo(`pedido-${p.numero}.html`, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${p.numero}</title><style>${css} body{padding:24px;background:#fff;color:#111} .assin{display:block}</style></head><body>${doc.outerHTML}<script>window.onload=()=>window.print()<\\/script></body></html>`);
}
"""),
]
for a, b in subs:
    app = troca(app, a, b)

# seletor de carteira na barra do topo (visível também no celular)
app = troca(app, '<h1 id="title"></h1>', '${seletorCarteiras()}<h1 id="title"></h1>')
app = troca(app, "<div class=\"brand\"><span>R</span>RepCRM</div><nav id=\"nav\">", "<div class=\"brand\"><span>R</span>RepCRM</div><div class=\"cart-nome\">${esc(Backend.carteira().nome)}</div><nav id=\"nav\">")
app = troca(app, "<h3>Seus dados (saem no pedido impresso)</h3>", "<h3>Dados da carteira ${esc(Backend.carteira().nome)} (saem no pedido impresso)</h3>")

# Configurações: sem senha/usuários (o acesso é pela conta Claude); backup e demonstração continuam
cfg_ini = app.index("    <div><div class=\"card\"><h3>Minha senha</h3>")
cfg_fim = app.index("      <div class=\"card\" style=\"margin-top:14px\"><h3>Backup</h3>")
app = app[:cfg_ini] + "    <div>\n" + app[cfg_fim:].replace("<div class=\"card\" style=\"margin-top:14px\"><h3>Backup</h3>", "<div class=\"card\"><h3>Backup</h3>", 1)
app = troca(app, "O servidor faz uma cópia automática por dia. Você também pode baixar uma cópia completa aqui.", "Seus dados ficam guardados nesta página, na sua conta Claude. Baixe uma cópia de vez em quando, por segurança.")
ini = app.index('async function trocarSenha()'); fim = app.index('async function baixarBackup()')
app = app[:ini] + app[fim:]
ini = app.index('async function restaurar(f) {'); fim = app.index('/* ================== INÍCIO')
app = app[:ini] + """async function restaurar(f) {
  if (!f) return;
  let d; try { d = JSON.parse(await f.text()); } catch { return aviso('Arquivo inválido.'); }
  if (!(await confirmar('Restaurar este backup? TODOS os dados atuais serão substituídos.', 'Restaurar'))) return;
  await acao(() => api('POST', '/api/restore', { backup: d.backup || d }), 'Backup restaurado');
}
async function resetar(modo) {
  if (modo === 'demo') { if (!(await confirmar(`Substituir TODOS os dados da carteira ${Backend.carteira().nome} por dados de exemplo (fictícios)?`, 'Carregar exemplo'))) return; }
  else if ((await perguntar(`Isso apaga TODOS os clientes, pedidos, comissões e cadastros da carteira ${Backend.carteira().nome}. Baixe um backup antes. Digite APAGAR para confirmar.`, '')) !== 'APAGAR') return;
  await acao(() => api('POST', '/api/reset', { modo }), modo === 'demo' ? 'Exemplo carregado' : 'Tudo apagado');
}

/* ================== CARTEIRAS (Mayrink / TRAC) ================== */
let trocando = false;
const seletorCarteiras = () => `<div class="carteiras" role="group" aria-label="Carteira">${Backend.CARTEIRAS.map(c => `<button class="${c.id === Backend.carteira().id ? 'on' : ''}" aria-pressed="${c.id === Backend.carteira().id}" onclick="trocarCarteira('${c.id}')">${esc(c.nome)}</button>`).join('')}</div>`;
async function trocarCarteira(id) {
  if (trocando || id === Backend.carteira().id) return;
  trocando = true; closeModal(); state = {};
  document.body.dataset.carteira = id;
  $('#view').innerHTML = '<div class="carregando">Abrindo carteira…</div>';
  try { await Backend.trocar(id); try { localStorage.setItem('rc_carteira', id); } catch (e) { } }
  finally { trocando = false; db = Backend.dados(); iniciarApp(); toast('Carteira ' + Backend.carteira().nome); }
}

/* ================== DIÁLOGOS (dentro da página) ================== */
function dialogo(html, botoes, foco) {
  return new Promise(res => {
    const el = $('#dlg');
    el.innerHTML = `<div class="dlg-bg"><div class="dlg" role="dialog" aria-modal="true">${html}<div class="actions">${botoes.map((b, i) => `<button class="btn ${b[2] || ''}" data-i="${i}">${esc(b[0])}</button>`).join('')}</div></div></div>`;
    const fim = v => { el.innerHTML = ''; document.removeEventListener('keydown', tecla, true); res(v); };
    const tecla = e => { if (e.key === 'Escape') { e.stopPropagation(); fim(botoes[0][1] === false ? false : null); } if (e.key === 'Enter' && el.querySelector('input')) { e.preventDefault(); fim(botoes[botoes.length - 1][1]()); } };
    document.addEventListener('keydown', tecla, true);
    el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const v = botoes[b.dataset.i][1]; fim(typeof v === 'function' ? v() : v); });
    const f = el.querySelector(foco || 'input') || el.querySelector('.btn.pri'); if (f) f.focus();
  });
}
const confirmar = (msg, ok = 'Confirmar') => dialogo(`<p>${esc(msg)}</p>`, [['Voltar', false], [ok, true, 'pri']]);
const perguntar = (msg, valor = '') => dialogo(`<p>${esc(msg)}</p><input id="dlgIn" value="${esc(valor)}">`, [['Cancelar', null], ['OK', () => ($('#dlgIn').value || '').trim() || null, 'pri']]);
const aviso = msg => dialogo(`<p>${esc(msg)}</p>`, [['OK', true, 'pri']]);

"""+ app[fim:]

# Início: conecta ao banco da página em vez do login
ini = app.index('/* ================== INÍCIO')
app = app[:ini] + """/* ================== INÍCIO ================== */
(async () => {
  $('#root').innerHTML = '<div class="carregando">Carregando seus dados…</div>';
  let primeira = true;
  let lembrada = ''; try { lembrada = localStorage.getItem('rc_carteira') || ''; } catch (e) { }
  const r = await Backend.iniciar(() => { if (primeira || trocando) return; db = Backend.dados(); render(); }, lembrada);
  document.body.dataset.carteira = Backend.carteira().id;
  if (!r.ok) { $('#root').innerHTML = '<div class="carregando"><b>Não foi possível abrir o banco de dados.</b><br>Entre na sua conta Claude para usar o RepCRM.</div>'; return; }
  primeira = false; db = Backend.dados(); iniciarApp();
  if (r.lento) toast('A conexão está lenta: alguns dados podem aparecer em instantes.');
})();
"""

# Painel vazio: primeiros passos
app = troca(app, "  $('#view').innerHTML = `\n  <div class=\"grid kpis\">",
"""  const inicio = !db.representadas.length ? `<div class="card boas-vindas"><h3>Comece por aqui</h3><ol>
      <li><a class="lnk" onclick="go('representadas')">Cadastre as empresas que você representa</a>: comissão, regra de pagamento e meta.</li>
      <li><a class="lnk" onclick="go('produtos')">Importe a tabela de preços</a> de cada uma (CSV do Excel) ou cadastre os produtos.</li>
      <li><a class="lnk" onclick="go('clientes')">Cadastre seus clientes</a> e comece a lançar pedidos e atividades.</li></ol>
      <p class="hint">Quer ver como fica antes? <a class="lnk" onclick="resetar('demo')">Carregar dados de exemplo</a> (fictícios; dá para apagar depois em Configurações).</p></div>` : '';
  $('#view').innerHTML = inicio + `
  <div class="grid kpis">""")
app = troca(app, "${c.email ? `<a class=\"btn sm\" href=\"mailto:${esc(c.email)}\">✉️ E-mail</a>` : ''}", "${c.email ? `<a class=\"btn sm\" href=\"mailto:${esc(c.email)}\">✉️ ${esc(c.email)}</a>` : ''}")

css = ler('public/style.css')
css = troca(css, "@media (prefers-color-scheme:dark){:root{", "@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){color-scheme:dark;")
escuro = re.search(r'@media \(prefers-color-scheme:dark\)\{:root:not\(\[data-theme="light"\]\)\{(.*?)\}\}', css, re.S).group(1)
css = css.replace('*{box-sizing:border-box}', ':root[data-theme="dark"]{' + escuro + '}\n*{box-sizing:border-box}', 1)
css = troca(css, "main{flex:1;min-width:0;padding:22px 26px 60px}", "main{flex:1;min-width:0;padding-block:22px 60px;padding-left:max(26px,env(safe-area-inset-left,0px));padding-right:max(26px,env(safe-area-inset-right,0px))}")
css = troca(css, "  main{padding:16px}", "  main{padding-block:16px 60px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}")
css += """
.carregando{min-height:60vh;display:grid;place-items:center;text-align:center;color:var(--muted);padding:24px}
.boas-vindas{margin-bottom:14px;border-color:var(--pri)}.boas-vindas ol{margin:0 0 8px;padding-left:20px;line-height:1.9}
.dlg-bg{position:fixed;inset:0;background:rgba(10,15,25,.55);display:grid;place-items:center;padding:16px;z-index:200}
.dlg{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:14px;padding:18px 20px;width:100%;max-width:440px}
.dlg p{margin:0 0 12px;white-space:pre-wrap}
.carteiras{display:inline-flex;border:1px solid var(--line);border-radius:10px;padding:3px;background:var(--panel);gap:2px}
.carteiras button{font:inherit;font-weight:600;border:0;background:none;color:var(--muted);padding:6px 14px;border-radius:7px;cursor:pointer}
.carteiras button.on{background:var(--pri);color:var(--on-pri)}
.carteiras button:focus-visible{outline:2px solid var(--pri);outline-offset:1px}
.cart-nome{margin:-8px 10px 8px;padding:4px 10px;border-radius:7px;background:var(--pri);color:var(--on-pri);font-weight:600;font-size:12px;display:inline-block}
body[data-carteira="trac"]{--pri:#1d4ed8;--pri2:#1e40af;--pri-soft:#e6edfd;--on-pri:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) body[data-carteira="trac"]{--pri:#7aa2ff;--pri2:#5b8cff;--pri-soft:#1d2a4a;--on-pri:#0b1530}}
:root[data-theme="dark"] body[data-carteira="trac"]{--pri:#7aa2ff;--pri2:#5b8cff;--pri-soft:#1d2a4a;--on-pri:#0b1530}
"""

js = lambda s: s.replace('</script', '<\\/script')
html = f"""<title>RepCRM</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
{css}
</style>
<div id="root"></div>
<div id="modal"></div>
<div id="dlg"></div>
<div class="toast" id="toast" role="status"></div>
<script>
{js(ler('lib/regras.js'))}
</script>
<script>
{js(backend)}
</script>
<script>
{js(app)}
</script>
"""
(AQUI / 'repcrm.html').write_text(html, encoding='utf-8')
print('ok', len(html) // 1024, 'KB')
