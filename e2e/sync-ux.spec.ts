import { expect, test } from '@playwright/test';
import {
  isMobileProject,
  loadDemoProject,
  selectSyncMode,
  trackErrors,
} from './helpers/studio';

declare global {
  interface Window {
    __lrcAudioElement?: HTMLAudioElement | null;
  }
}

test.describe('UX de sincronización y barra de tiempo (T19)', () => {
  test('arrastre de aguja, sincronía al retroceder, salto al seleccionar línea, expansión y Ráfaga sin auto-play', async ({
    page,
  }, testInfo) => {
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await loadDemoProject(page);

    const slider = page.getByRole('slider', { name: 'Posición en la forma de onda' });
    const box = await slider.boundingBox();
    expect(box).toBeTruthy();

    // 1 y 4. Barra compacta por defecto, se expande al tocar/arrastrar y cambia currentTime
    await expect(slider).toHaveAttribute('data-expanded', 'false');

    const startX = box!.x + box!.width * 0.2;
    const y = box!.y + box!.height / 2;

    await slider.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: isMobile ? 'touch' : 'mouse',
      clientX: startX,
      clientY: y,
      isPrimary: true,
    });
    await expect(slider).toHaveAttribute('data-expanded', 'true');

    const expandedBox = await slider.boundingBox();
    expect(expandedBox).toBeTruthy();
    const endX = expandedBox!.x + expandedBox!.width * 0.7;
    const expandedY = expandedBox!.y + expandedBox!.height / 2;

    await slider.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: isMobile ? 'touch' : 'mouse',
      clientX: endX,
      clientY: expandedY,
      isPrimary: true,
    });
    await slider.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: isMobile ? 'touch' : 'mouse',
      clientX: endX,
      clientY: expandedY,
      isPrimary: true,
    });

    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
      .toBeGreaterThan(15_000);

    await expect
      .poll(async () =>
        page.evaluate(() => window.__lrcAudioElement?.currentTime ?? -1),
      )
      .toBeGreaterThan(15);

    // Se compacta tras soltar y esperar el retardo sin interacción
    await expect(slider).toHaveAttribute('data-expanded', 'false', { timeout: 3000 });

    // 2. Retroceder mucho durante reproducción mantiene sincronía entre audio.currentTime y contador
    await page.getByRole('button', { name: 'Reproducir' }).click();
    await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();

    await page.getByRole('button', { name: 'Retroceder 5 segundos' }).click();
    await page.getByRole('button', { name: 'Retroceder 5 segundos' }).click();

    await expect
      .poll(async () => {
        const sliderVal = Number(await slider.getAttribute('aria-valuenow'));
        const audioMs = await page.evaluate(() =>
          Math.round((window.__lrcAudioElement?.currentTime ?? -1) * 1000),
        );
        return Math.abs(sliderVal - audioMs);
      })
      .toBeLessThan(600);

    await page.getByRole('button', { name: 'Pausar' }).click();

    // 3. Seleccionar una línea sincronizada mueve la aguja y el contador a su marca
    const syncedLine1 = page.getByRole('button', {
      name: /Luces de neón brillan en la ciudad/i,
    });
    await syncedLine1.click();
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
      .toBe(1500);

    // 6. Entrar a Ráfaga no inicia reproducción (audio.paused sigue true) y salir detiene
    await selectSyncMode(page, 'Ráfaga');
    await expect(page.getByText(/Ráfaga/i).first()).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => window.__lrcAudioElement?.paused ?? null))
      .toBe(true);
    await expect(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();

    // Al pulsar Reproducir sí reproduce, y al detener/salir se pausa
    await page.getByRole('button', { name: 'Reproducir' }).click();
    await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
    await page.getByRole('button', { name: 'Detener ráfaga' }).click();
    await expect
      .poll(async () => page.evaluate(() => window.__lrcAudioElement?.paused ?? null))
      .toBe(true);

    assertNoErrors();
  });

  test('espacio vertical en móvil: ≥5 líneas en 390x844 y ≥4 en 360x640 sin scroll de página', async ({
    page,
  }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Solo aplica al viewport móvil');
    const assertNoErrors = trackErrors(page);

    await page.goto('/');
    await loadDemoProject(page);

    // Verificar 390x844: ≥ 5 líneas visibles en la lista y sin scroll de página
    const metrics390 = await page.evaluate(() => {
      const list = document.querySelector('[data-testid="sync-line-list"]');
      const listRect = list?.getBoundingClientRect();
      const buttons = list ? Array.from(list.querySelectorAll('button')) : [];
      const visibleCount = buttons.filter((btn) => {
        if (!listRect) return false;
        const r = btn.getBoundingClientRect();
        return r.top >= listRect.top - 1 && r.bottom <= listRect.bottom + 1;
      }).length;
      const docScroll =
        document.documentElement.scrollHeight - document.documentElement.clientHeight;
      return { visibleCount, docScroll };
    });

    expect(metrics390.docScroll).toBeLessThanOrEqual(1);
    expect(metrics390.visibleCount).toBeGreaterThanOrEqual(5);

    // Captura 390x844 barra compacta
    await page.screenshot({
      path: 'test-results/t19-390x844-compact.png',
      fullPage: false,
    });

    // Expandir barra y capturar
    const slider = page.getByRole('slider', { name: 'Posición en la forma de onda' });
    const box = await slider.boundingBox();
    expect(box).toBeTruthy();
    await slider.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: box!.x + box!.width * 0.4,
      clientY: box!.y + box!.height / 2,
      isPrimary: true,
    });
    await expect(slider).toHaveAttribute('data-expanded', 'true');
    await page.screenshot({
      path: 'test-results/t19-390x844-expanded.png',
      fullPage: false,
    });
    await slider.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: box!.x + box!.width * 0.4,
      clientY: box!.y + box!.height / 2,
      isPrimary: true,
    });

    // Verificar 360x640: ≥ 4 líneas visibles y sin scroll de página
    await page.setViewportSize({ width: 360, height: 640 });
    await expect(slider).toHaveAttribute('data-expanded', 'false', { timeout: 3000 });

    const metrics360 = await page.evaluate(() => {
      const list = document.querySelector('[data-testid="sync-line-list"]');
      const listRect = list?.getBoundingClientRect();
      const buttons = list ? Array.from(list.querySelectorAll('button')) : [];
      const visibleCount = buttons.filter((btn) => {
        if (!listRect) return false;
        const r = btn.getBoundingClientRect();
        return r.top >= listRect.top - 1 && r.bottom <= listRect.bottom + 1;
      }).length;
      const docScroll =
        document.documentElement.scrollHeight - document.documentElement.clientHeight;
      return { visibleCount, docScroll };
    });

    expect(metrics360.docScroll).toBeLessThanOrEqual(1);
    expect(metrics360.visibleCount).toBeGreaterThanOrEqual(4);

    await page.screenshot({
      path: 'test-results/t19-360x640-compact.png',
      fullPage: false,
    });

    assertNoErrors();
  });

  test('seguimiento de reproducción resalta la línea activa sin scroll de página y conserva dimensiones sin marca', async ({
    page,
  }, testInfo) => {
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await loadDemoProject(page);

    const line1 = page.getByRole('button', { name: /Luces de neón brillan en la ciudad/i });
    const line2 = page.getByRole('button', { name: /Caminamos juntos sin mirar atrás/i });
    const line5 = page.getByRole('button', { name: /Subimos el volumen hasta el amanecer/i });

    // B) Línea sin marca tiene marcador --:--.--, aria-label accesible y misma altura que una línea con marca
    await expect(line5.locator('[aria-label="Sin marca de tiempo"]')).toHaveText('--:--.--');
    const hSynced = (await line1.boundingBox())!.height;
    const hUnsynced = (await line5.boundingBox())!.height;
    expect(Math.abs(hSynced - hUnsynced)).toBeLessThanOrEqual(1);

    // A) Seguimiento durante reproducción: al pasar de 1.5s resalta línea 1, y al pasar de 5.2s pasa a línea 2
    await line1.click();
    await page.getByRole('button', { name: 'Reproducir' }).click();
    await expect(line1).toHaveAttribute('data-playing', 'true', { timeout: 6000 });

    // Adelantar 5s para entrar en el rango de la línea 2 (00:05.20)
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await expect(line2).toHaveAttribute('data-playing', 'true', { timeout: 6000 });
    if (isMobile) {
      await expect(page.getByRole('button', { name: /MARCAR LÍNEA 2/i })).toBeVisible();
    }

    // La página no hizo scroll vertical
    const docScrollTop = await page.evaluate(() => document.documentElement.scrollTop);
    expect(docScrollTop).toBe(0);

    await page.getByRole('button', { name: 'Pausar' }).click();
    assertNoErrors();
  });
});
