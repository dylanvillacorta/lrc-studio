import { expect, test } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  openLyrics,
  selectSyncMode,
} from './helpers/studio';

test.describe('Escritorio: atajos de teclado y responsive', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(isMobileProject(testInfo), 'Pruebas exclusivas del proyecto desktop');
  });

  test('atajos Espacio, R, P, flechas, corchetes, Z y Ctrl+Z funcionan y se ignoran en el textarea de Letra', async ({
    page,
  }) => {
    await page.goto('/');
    await createProjectWithLyricsAndWav(page, false);

    // P alterna reproducción/pausa
    await page.keyboard.press('p');
    await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
    await page.keyboard.press('p');
    await expect(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();

    // Seleccionar línea 5, adelantar 5s y marcar con Espacio
    const line5 = page.getByRole('button', {
      name: /Subimos el volumen hasta el amanecer/i,
    });
    await line5.click();
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await page.keyboard.press('Space');
    await expect(line5).toContainText(/00:05\.\d{2}/);

    // Seleccionar línea 5 para inspeccionar y ajustar con flechas (±50 ms) y corchetes (±10 ms)
    await line5.click();
    const inspector = page.getByRole('region', { name: 'Inspector de tiempos' });
    const readInspectorStartMs = async (): Promise<number> => {
      const txt = (await inspector.textContent()) ?? '';
      const match = txt.match(/INICIO(\d{2}):(\d{2})\.(\d{3})/);
      if (!match) {
        throw new Error(`No se encontró tiempo INICIO en Inspector: ${txt}`);
      }
      return Number(match[1]) * 60_000 + Number(match[2]) * 1000 + Number(match[3]);
    };

    const baseMs = await readInspectorStartMs();
    expect(baseMs).toBeGreaterThanOrEqual(5000);

    await page.keyboard.press('ArrowRight');
    await expect.poll(readInspectorStartMs).toBe(baseMs + 50);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(readInspectorStartMs).toBe(baseMs);

    await page.keyboard.press(']');
    await expect.poll(readInspectorStartMs).toBe(baseMs + 10);
    await page.keyboard.press('[');
    await expect.poll(readInspectorStartMs).toBe(baseMs);

    // Z y Ctrl+Z deshacen
    await page.keyboard.press('z');
    await expect.poll(readInspectorStartMs).toBe(baseMs + 10);
    await page.keyboard.press('Control+z');
    await expect.poll(readInspectorStartMs).toBe(baseMs);

    // R repite Pre-Roll en modo Palabra
    await selectSyncMode(page, 'Palabra');
    await page.keyboard.press('r');
    await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
    await page.keyboard.press('p');

    // Al escribir en el textarea de Letra no deben dispararse atajos globales
    await openLyrics(page, false);
    const textarea = page.getByLabel('Letra de la canción, una línea por verso');
    await textarea.click();
    await textarea.pressSequentially(' zr[]p ');
    await expect(textarea).toHaveValue(/ zr\[\]p $/);
    await expect(page.getByRole('region', { name: 'Editor de letra' })).toBeVisible();
  });

  test('sin scroll horizontal en 768, 1280 y 1920 px y redimensionar a 390 conserva estado', async ({
    page,
  }) => {
    await page.goto('/');
    await createProjectWithLyricsAndWav(page, false);

    for (const width of [768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      const hasNoOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(hasNoOverflow, `Overflow horizontal detectado en ${width}px`).toBe(true);
    }

    // Marcar línea 5 a 1280px y redimensionar a 390x844
    await page.setViewportSize({ width: 1280, height: 800 });
    const line5 = page.getByRole('button', {
      name: /Subimos el volumen hasta el amanecer/i,
    });
    await line5.click();
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await page.keyboard.press('Space');
    await expect(line5).toContainText(/00:05\.\d{2}/);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('navigation', { name: 'Navegación principal' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Subimos el volumen hasta el amanecer/i }),
    ).toContainText('00:05.00');
  });
});
