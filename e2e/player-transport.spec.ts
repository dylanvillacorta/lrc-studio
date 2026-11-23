import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  selectSyncMode,
  tapOrPointerDown,
  trackErrors,
  waitForSaved,
} from './helpers/studio';

declare global {
  interface Window {
    __lrcAudioElement?: HTMLAudioElement | null;
  }
}

function parseTime(text: string): number {
  const match = /(\d\d):(\d\d)\.(\d\d)/.exec(text);
  if (!match) throw new Error(`Sin tiempo en: ${text}`);
  return Number(match[1]) * 60_000 + Number(match[2]) * 1000 + Number(match[3]) * 10;
}

async function setSavedPlaybackRate(page: Page, rate: number): Promise<void> {
  await page.evaluate(async (value) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('lyricsync-studio');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const records = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const req = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      req.onsuccess = () => resolve(req.result as Array<Record<string, unknown>>);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      for (const record of records) {
        const settings = (record.settings ?? {}) as Record<string, unknown>;
        tx.objectStore('projects').put({
          ...record,
          settings: { ...settings, playbackRate: value },
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, rate);
}

test.describe('Transporte, velocidad y Lupa eliminada', () => {
  test('en Palabra (móvil) hay reproducir/pausa, ±5 s y velocidad sin desborde', async ({
    page,
  }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'El transporte de Palabra es del layout móvil');
    const assertNoErrors = trackErrors(page);
    await page.goto('/');
    await createProjectWithLyricsAndWav(page, true);
    await selectSyncMode(page, 'Palabra');

    const play = page.getByRole('button', { name: 'Reproducir', exact: true });
    await expect(play).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retroceder 5 segundos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adelantar 5 segundos' })).toBeVisible();
    await play.click();
    await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__lrcAudioElement?.paused ?? true))
      .toBe(false);
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__lrcAudioElement?.paused ?? false))
      .toBe(true);

    // 1 → 1.25 → 1.5 → 0.5 → 0.75
    for (let i = 0; i < 4; i += 1) {
      await page.getByRole('button', { name: /^Velocidad / }).click();
    }
    await expect(page.getByRole('button', { name: 'Velocidad 0.75x' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__lrcAudioElement?.playbackRate ?? 0))
      .toBe(0.75);

    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      sh: document.documentElement.scrollHeight,
      ch: document.documentElement.clientHeight,
    }));
    expect(m.sw).toBeLessThanOrEqual(m.cw);
    expect(m.sh).toBeLessThanOrEqual(m.ch);
    const stamp = await page.getByRole('button', { name: /MARCAR PALABRA/i }).boundingBox();
    expect(stamp).not.toBeNull();
    expect((stamp?.y ?? 0) + (stamp?.height ?? 0)).toBeLessThanOrEqual(844);
    assertNoErrors();
  });

  test('la velocidad siempre arranca en 1x aunque el proyecto guardado tenga otra, y cambiarla no guarda', async ({
    page,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile);
    await waitForSaved(page);

    // Cambiar la velocidad no guarda el proyecto.
    await page.getByRole('button', { name: /^Velocidad / }).first().click();
    await expect(page.getByText('Guardando', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Velocidad 1.25x' }).first()).toBeVisible();

    // Se siembra un proyecto guardado con 0.75 desde un documento estático y se vuelve a abrir.
    await page.goto('/manifest.webmanifest');
    await page.waitForTimeout(500);
    await setSavedPlaybackRate(page, 0.75);
    await page.goto('/');
    await expect
      .poll(() => page.evaluate(() => window.__lrcAudioElement?.playbackRate ?? 0))
      .toBe(1);
    await expect(page.getByRole('button', { name: 'Velocidad 1x' }).first()).toBeVisible();
  });

  test('no existe el botón Lupa y el inspector de escritorio ajusta ±10 y ±50 ms', async ({
    page,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile);
    await expect(page.getByRole('button', { name: /lupa/i })).toHaveCount(0);

    if (isMobile) {
      await selectSyncMode(page, 'Palabra');
      await expect(page.getByRole('button', { name: /lupa/i })).toHaveCount(0);
      return;
    }

    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await tapOrPointerDown(page, page.getByRole('button', { name: /MARCAR LÍNEA 1/i }), false);
    await page.getByRole('button', { name: /Luces de neón brillan en la ciudad/i }).click();

    const inspector = page.getByRole('region', { name: 'Inspector de tiempos' });
    const start = async () => parseTime((await inspector.textContent()) ?? '');
    const before = await start();
    await inspector.getByRole('button', { name: 'Ajustar inicio +50 ms' }).click();
    await expect.poll(start).toBeGreaterThanOrEqual(before + 40);
    await inspector.getByRole('button', { name: 'Ajustar inicio −10 ms' }).click();
    await expect.poll(start).toBeLessThanOrEqual(before + 40);
    await expect.poll(start).toBeGreaterThanOrEqual(before + 30);
  });
});
