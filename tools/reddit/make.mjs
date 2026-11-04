import pw from 'playwright';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.argv[2] || here + 'out';
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 2000, height: 1400 } });
await p.goto('file://' + here + 'assets.html');
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(300);
for (const [id, name] of [['desk', 'banner-desktop-1920x384'], ['mob', 'banner-mobile-1600x480'], ['icon', 'icon-256']])
  await p.locator('#' + id).screenshot({ path: `${out}/${name}.png` });
await b.close();
