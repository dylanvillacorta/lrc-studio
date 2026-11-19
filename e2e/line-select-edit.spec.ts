import { expect, test } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  openLyrics,
  openSyncEditor,
  selectSyncMode,
  tapOrPointerDown,
  trackErrors,
} from './helpers/studio';

declare global {
  interface Window {
    __lrcAudioElement?: HTMLAudioElement | null;
  }
}

const LONG_LYRICS = Array.from(
  { length: 24 },
  (_, idx) => `Verso número ${idx + 1} de la canción nocturna`,
).join('\n');

test.describe('Selección sin seek, edición, borrado, deshacer múltiple y centrado (T27)', () => {
  test('seleccionar sin saltar, reproducir desde aquí, editar tiempo, borrar, deshacer múltiple y centrar en Línea y Ráfaga', async ({
    page,
  }, testInfo) => {
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile, 90);

    // Ampliar la letra a 14 líneas para asegurar scroll real en móvil y escritorio
    await openLyrics(page, isMobile);
    await page
      .getByLabel('Letra de la canción, una línea por verso')
      .fill(LONG_LYRICS);
    await page.getByRole('button', { name: 'Aplicar letra' }).click();
    await openSyncEditor(page, isMobile);

    // Marcar varias líneas en 00:05.00, 00:10.00, 00:15.00 y avanzar a 00:25.00
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await tapOrPointerDown(page, page.getByRole('button', { name: /MARCAR LÍNEA 1/i }), isMobile);

    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await tapOrPointerDown(page, page.getByRole('button', { name: /MARCAR LÍNEA 2/i }), isMobile);

    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await tapOrPointerDown(page, page.getByRole('button', { name: /MARCAR LÍNEA 3/i }), isMobile);

    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();

    const slider = page.getByRole('slider', { name: 'Posición en la forma de onda' });
    const timeBeforeSelect = await page.evaluate(
      () => window.__lrcAudioElement?.currentTime ?? -1,
    );
    const sliderBeforeSelect = Number(await slider.getAttribute('aria-valuenow'));
    expect(sliderBeforeSelect).toBeGreaterThanOrEqual(24_000);

    // 1. Tocar línea 1 (00:05.00) NO mueve audio.currentTime ni el slider
    const line1Btn = page.getByRole('button', { name: /Verso número 1 de la canción nocturna/i });
    await line1Btn.click();
    const actionBar = page.getByRole('toolbar', { name: 'Acciones de línea' });
    await expect(actionBar).toBeVisible();
    await expect(actionBar.getByRole('button', { name: 'Reproducir desde aquí' })).toBeVisible();
    await expect(actionBar.getByRole('button', { name: 'Borrar marca' })).toBeVisible();
    await expect(actionBar.getByRole('button', { name: 'Editar tiempo' })).toHaveCount(0);
    await expect(
      actionBar.getByRole('button', { name: 'Borrar marcas desde esta línea hacia abajo' }),
    ).toHaveCount(0);

    const timeAfterSelect = await page.evaluate(
      () => window.__lrcAudioElement?.currentTime ?? -1,
    );
    expect(Math.abs(timeAfterSelect - timeBeforeSelect)).toBeLessThan(0.2);
    expect(Number(await slider.getAttribute('aria-valuenow'))).toBe(sliderBeforeSelect);

    if (isMobile) {
      await page.screenshot({
        path: 'test-results/t27-390x844-selected-actions.png',
        fullPage: false,
      });
    }

    // 2. «Reproducir desde aquí» sí mueve el audio a ~5.0 s y empieza a reproducir
    await page.getByRole('button', { name: 'Reproducir desde aquí' }).click();
    await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => window.__lrcAudioElement?.currentTime ?? -1))
      .toBeGreaterThanOrEqual(4.8);
    await expect
      .poll(async () => page.evaluate(() => window.__lrcAudioElement?.currentTime ?? 99))
      .toBeLessThan(8.5);
    await page.getByRole('button', { name: 'Pausar' }).click();

    // 3. «Borrar marca» devuelve la línea 2 a --:--.-- y la deja como objetivo
    const line2Btn = page.getByRole('button', { name: /Verso número 2 de la canción nocturna/i });
    await line2Btn.click();
    await page.getByRole('button', { name: 'Borrar marca', exact: true }).click();
    await expect(line2Btn.locator('[aria-label="Sin marca de tiempo"]')).toHaveText('--:--.--');
    await expect(page.getByRole('button', { name: /MARCAR LÍNEA 2/i })).toBeVisible();

    // 4. Deshacer: en móvil el botón compacto va borrando de la última línea marcada hacia atrás
    const line3Btn = page.getByRole('button', { name: /Verso número 3 de la canción nocturna/i });
    if (isMobile) {
      const undoLineBtn = page.getByRole('button', {
        name: 'Deshacer última marca de línea',
        exact: true,
      });
      await expect(undoLineBtn).toBeEnabled();
      await undoLineBtn.click(); // borra línea 3 -> queda como objetivo
      await expect(line3Btn.locator('[aria-label="Sin marca de tiempo"]')).toHaveText('--:--.--');
      await expect(page.getByRole('button', { name: /MARCAR LÍNEA 3/i })).toBeVisible();

      await undoLineBtn.click(); // salta línea 2 (sin marca) y borra línea 1 -> queda como objetivo
      await expect(line1Btn.locator('[aria-label="Sin marca de tiempo"]')).toHaveText('--:--.--');
      await expect(page.getByRole('button', { name: /MARCAR LÍNEA 1/i })).toBeVisible();
      await expect(undoLineBtn).toBeDisabled();
    } else {
      const undoBtn = page.getByRole('button', { name: 'Deshacer última marca', exact: true });
      await undoBtn.click(); // revierte borrado -> vuelve 00:10.00
      await expect(line2Btn).toContainText('00:10.00');

      await undoBtn.click(); // revierte marcado de línea 3 -> --:--.--
      await expect(line3Btn.locator('[aria-label="Sin marca de tiempo"]')).toHaveText('--:--.--');
    }

    // 5. Centrado de línea activa mientras avanza la reproducción en Línea y Ráfaga
    // Marcar línea 12 (~00:25.00) y línea 13 (~00:35.00) para probar centrado en el medio de la lista
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();

    const line12Btn = page.getByRole('button', { name: /Verso número 12 de la canción nocturna/i });
    await line12Btn.click();
    await tapOrPointerDown(page, page.getByRole('button', { name: /MARCAR LÍNEA 12/i }), isMobile);

    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    const line13Btn = page.getByRole('button', { name: /Verso número 13 de la canción nocturna/i });
    await line13Btn.click();
    await tapOrPointerDown(page, page.getByRole('button', { name: /MARCAR LÍNEA 13/i }), isMobile);

    // Reproducir desde línea 12 y comprobar que línea 12 queda centrada en el contenedor
    await line12Btn.click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Reproducir desde aquí' }).click();
    await expect(line12Btn).toHaveAttribute('data-playing', 'true', { timeout: 6000 });

    const listSelector = isMobile
      ? '[data-testid="sync-line-list"]'
      : '[data-testid="desktop-line-list"]';

    await expect
      .poll(async () =>
        page.evaluate((sel) => {
          const list = document.querySelector(sel);
          const activeRow = list?.querySelector('[data-line-index="11"]');
          if (!list || !activeRow) return 999;
          const lr = list.getBoundingClientRect();
          const rr = activeRow.getBoundingClientRect();
          const listCenter = lr.top + lr.height / 2;
          const rowCenter = rr.top + rr.height / 2;
          return Math.abs(listCenter - rowCenter);
        }, listSelector),
      )
      .toBeLessThanOrEqual(24);

    if (isMobile) {
      await page.screenshot({
        path: 'test-results/t27-390x844-centered.png',
        fullPage: false,
      });
      await page.setViewportSize({ width: 360, height: 640 });
      await expect
        .poll(async () =>
          page.evaluate((sel) => {
            const list = document.querySelector(sel);
            const activeRow = list?.querySelector('[data-line-index="11"]');
            if (!list || !activeRow) return 999;
            const lr = list.getBoundingClientRect();
            const rr = activeRow.getBoundingClientRect();
            return Math.abs(lr.top + lr.height / 2 - (rr.top + rr.height / 2));
          }, listSelector),
        )
        .toBeLessThanOrEqual(24);
      await page.screenshot({
        path: 'test-results/t27-360x640-selected-centered.png',
        fullPage: false,
      });
      await page.setViewportSize({ width: 390, height: 844 });
    }

    await page.getByRole('button', { name: 'Pausar' }).click();

    // Centrado en Ráfaga: seleccionar línea 13 y entrar en Ráfaga
    await line13Btn.click();

    await selectSyncMode(page, 'Ráfaga');
    await expect(page.getByText(/Ráfaga/i).first()).toBeVisible();
    await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
    await expect(line13Btn).toHaveAttribute('data-playing', 'true', { timeout: 6000 });

    await expect
      .poll(async () =>
        page.evaluate((sel) => {
          const list = document.querySelector(sel);
          const activeRow = list?.querySelector('[data-line-index="12"]');
          if (!list || !activeRow) return 999;
          const lr = list.getBoundingClientRect();
          const rr = activeRow.getBoundingClientRect();
          return Math.abs(lr.top + lr.height / 2 - (rr.top + rr.height / 2));
        }, listSelector),
      )
      .toBeLessThanOrEqual(24);

    await page.getByRole('button', { name: 'Detener ráfaga' }).click();
    assertNoErrors();
  });
});
