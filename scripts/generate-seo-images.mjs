import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

const iconSvg = fs.readFileSync(path.join(publicDir, 'favicon.svg'), 'utf8');

const ogHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1200px;
    height: 630px;
    background: #E6E2DC;
    font-family: system-ui, -apple-system, Segoe UI, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #1F1D1A;
  }
  .card {
    width: 1080px;
    height: 510px;
    border-radius: 32px;
    background: #ECE8E2;
    box-shadow: 18px 18px 36px #C8C3BC, -18px -18px 36px #FFFFFF;
    padding: 56px 64px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .badge {
    width: 84px;
    height: 84px;
    border-radius: 20px;
    background: #E6E2DC;
    box-shadow: 6px 6px 14px #C8C3BC, -6px -6px 14px #FFFFFF;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .title {
    font-size: 56px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .subtitle {
    font-size: 28px;
    line-height: 1.4;
    color: #555049;
    max-width: 860px;
  }
  .wave {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 80px;
  }
  .bar {
    width: 14px;
    border-radius: 999px;
    background: #B53A22;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    font-size: 22px;
    font-weight: 600;
    color: #6B655D;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="top">
      <div class="badge">${iconSvg}</div>
      <div class="title">LRC Studio</div>
    </div>
    <div class="subtitle">
      Sincroniza letras LRC y ELRC palabra por palabra para karaoke directamente en el navegador, sin subir archivos.
    </div>
    <div class="wave">
      <div class="bar" style="height:28px"></div>
      <div class="bar" style="height:54px"></div>
      <div class="bar" style="height:76px"></div>
      <div class="bar" style="height:42px"></div>
      <div class="bar" style="height:68px"></div>
      <div class="bar" style="height:34px"></div>
      <div class="bar" style="height:62px"></div>
      <div class="bar" style="height:48px"></div>
      <div class="bar" style="height:74px"></div>
      <div class="bar" style="height:30px"></div>
    </div>
    <div class="footer">
      <span>LRC · ELRC · JSON · Karaoke 60 FPS</span>
      <span>lrc.dirtykeras.com</span>
    </div>
  </div>
</body>
</html>`;

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(ogHtml);
    await page.screenshot({ path: path.join(publicDir, 'og-image.png') });

    const iconSizes = [
      { name: 'favicon-32x32.png', size: 32 },
      { name: 'apple-touch-icon.png', size: 180 },
      { name: 'icon-192.png', size: 192 },
      { name: 'icon-512.png', size: 512 },
    ];

    for (const { name, size } of iconSizes) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<!doctype html><html><body style="margin:0;padding:0;background:#E6E2DC;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;">${iconSvg.replace('width="64" height="64"', `width="${size}" height="${size}"`)}</body></html>`,
      );
      await page.screenshot({ path: path.join(publicDir, name) });
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
