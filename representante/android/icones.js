// Gera os ícones do app (PNG) a partir do logotipo "R". Uso: node icones.js
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const legado = px => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 48 48"><rect x="2" y="2" width="44" height="44" rx="10" fill="#0f766e"/><text x="24" y="34" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">R</text></svg>`;
// camada da frente do ícone adaptativo: 108dp, com o desenho dentro da área segura central (66dp)
const frente = px => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 108 108"><text x="54" y="71" font-family="Arial,Helvetica,sans-serif" font-size="46" font-weight="700" fill="#fff" text-anchor="middle">R</text></svg>`;
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  for (const [d, f] of Object.entries(DENS)) {
    const dir = path.join(__dirname, 'res', 'mipmap-' + d); fs.mkdirSync(dir, { recursive: true });
    for (const [nome, svg, base] of [['ic_launcher.png', legado, 48], ['ic_launcher_foreground.png', frente, 108]]) {
      const px = Math.round(base * f);
      await pg.setViewportSize({ width: px, height: px });
      await pg.setContent(`<html><body style="margin:0;background:transparent">${svg(px)}</body></html>`);
      await pg.locator('svg').screenshot({ path: path.join(dir, nome), omitBackground: true });
    }
  }
  await b.close(); console.log('ícones gerados');
})();
