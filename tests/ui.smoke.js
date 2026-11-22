/* Teste de fumaça da interface: abre todas as telas e janelas de cada perfil, no computador e no celular,
 * em tema claro e escuro, procurando erros de JavaScript, telas vazias e estouro horizontal no celular.
 * Requer Playwright (npm i -D playwright && npx playwright install chromium). Rodar: node tests/ui.smoke.js */
'use strict';
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch { console.log('Playwright não instalado — teste de interface ignorado.'); process.exit(0); }
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'distribpro-ui-'));
const PORTA = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORTA}`;
const PERFIS = [['admin@distribpro.local', 'admin123'], ['carlos@distribpro.local', '123456'], ['compras@bompreco.com.br', '123456']];
// janelas abertas em cada perfil (só as que o perfil pode usar)
const JANELAS = {
  admin: ["novoPedido()", "verPedido(db.pedidos[0].id)", "verCliente(db.clientes[0].id)", "editar('produtos', db.produtos[0].id)", "editar('clientes')", "editar('usuarios', db.usuarios[1].id)",
    "lancMov()", "novaConta()", "verConta(db.pagar[0].id)", "pagarConta(db.pagar.find(t=>!t.pago).id)", "novaCompra()", "sugerirCompra()", "verCompra(db.compras[0].id)", "verFornecedor(db.fornecedores[0].id)",
    "editar('bancos')", "abrirConciliacao(db.extrato[0].id)", "agendarVisita()", "gerarRoteiro()", "editar('tabelas', db.tabelas[0].id)"],
  vendedor: ["novoPedido()", "verPedido(db.pedidos[0].id)", "verCliente(db.clientes[0].id)", "editar('clientes', db.clientes[0].id)", "editar('produtos', db.produtos[0].id)", "agendarVisita()", "gerarRoteiro()"],
  cliente: ["novoPedido()", "verPedido(db.pedidos[0].id)", "duplicarPedido(db.pedidos[0].id)"],
};

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORTA), DB_FILE: path.join(DIR, 'ui.db'), BACKUP_DIAS: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(ok => srv.stdout.on('data', d => String(d).includes('rodando em') && ok()));
  const b = await chromium.launch(); const falhas = []; let telas = 0, janelas = 0;
  try {
    for (const [email, senha] of PERFIS) for (const [disp, tema] of [['desktop', 'light'], ['celular', 'dark']]) {
      const ctx = await b.newContext(disp === 'celular' ? { ...devices['Pixel 7'], colorScheme: tema } : { viewport: { width: 1366, height: 860 }, colorScheme: tema });
      const p = await ctx.newPage(); const onde = () => `${email} ${disp}/${tema}`;
      p.on('pageerror', e => falhas.push(`${onde()}: erro JS: ${e.message}`));
      p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) falhas.push(`${onde()}: console: ${m.text()}`); });
      p.on('dialog', d => d.dismiss());
      await p.goto(BASE); await p.fill('input[name=email]', email); await p.fill('input[name=senha]', senha); await p.click('button.btn.pri'); await p.waitForSelector('#view');
      const papel = await p.evaluate(() => db.me.papel);
      for (const pg of await p.evaluate(() => pages().filter(x => x[0] !== 'sep').map(x => x[0]))) {
        await p.evaluate(x => go(x), pg); await p.waitForTimeout(60); telas++;
        const info = await p.evaluate(() => ({ vazio: !document.querySelector('#view').innerText.trim(), larg: document.documentElement.scrollWidth - window.innerWidth }));
        if (info.vazio) falhas.push(`${onde()}: tela "${pg}" vazia`);
        if (disp === 'celular' && info.larg > 2) falhas.push(`${onde()}: tela "${pg}" estoura ${info.larg}px na horizontal`);
      }
      for (const j of JANELAS[papel]) {
        await p.evaluate(() => closeModal());
        try { await p.evaluate(j); janelas++; } catch (e) { falhas.push(`${onde()}: ${j}: ${e.message.split('\n')[0]}`); continue; }
        await p.waitForTimeout(40);
        if (!(await p.evaluate(() => !!document.querySelector('.modal')))) falhas.push(`${onde()}: ${j} não abriu janela`);
        if (disp === 'celular') { const l = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (l > 2) falhas.push(`${onde()}: janela ${j} estoura ${l}px`); }
      }
      await ctx.close();
    }
  } finally { await b.close(); srv.kill('SIGTERM'); fs.rmSync(DIR, { recursive: true, force: true }); }
  console.log(`${telas} telas e ${janelas} janelas verificadas em 3 perfis × (computador claro, celular escuro).`);
  if (falhas.length) { console.log(`\n${falhas.length} problema(s):\n- ` + [...new Set(falhas)].join('\n- ')); process.exit(1); }
  console.log('Nenhum problema encontrado ✅');
})();
