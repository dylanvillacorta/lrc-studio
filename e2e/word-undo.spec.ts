import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  selectSyncMode,
  tapOrPointerDown,
  trackErrors,
} from './helpers/studio';

declare global {
  interface Window {
    __lrcAudioElement?: HTMLAudioElement | null;
  }
}

// Línea 1: «Luces de neón brillan en la ciudad» (7 palabras). Pre-Roll por defecto: 2,5 s.
const PRE_ROLL_S = 2.5;

function targetWord(page: Page) {
  return page.getByText('PALABRA OBJETIVO').locator('xpath=following-sibling::div[1]');
}

function wordButton(page: Page, text: string) {
  return page.getByRole('button', { name: `Elegir palabra «${text}»`, exact: true }).first();
}

function undoButton(page: Page, isMobile: boolean) {
  return page.getByRole('button', {
    name: isMobile ? 'Deshacer última palabra' : 'Deshacer última marca',
    exact: true,
  });
}

async function setAudioTime(page: Page, seconds: number) {
  await page.evaluate((s) => {
    const audio = window.__lrcAudioElement;
    if (audio) audio.currentTime = s;
  }, seconds);
}

async function stampWordAt(page: Page, isMobile: boolean, seconds: number) {
  await setAudioTime(page, seconds);
  await tapOrPointerDown(page, page.getByRole('button', { name: /MARCAR PALABRA/i }), isMobile);
}

test.describe('Deshacer en modo Palabra', () => {
  test('desmarca la última palabra, deja el foco en ella y reproduce con Pre-Roll', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile, 40);
    await selectSyncMode(page, 'Palabra');
    await expect(targetWord(page)).toHaveText('Luces');

    // Sin marcas el botón de deshacer está desactivado.
    await expect(undoButton(page, isMobile)).toBeDisabled();

    // Marcar 3 palabras: Luces (6 s), de (7 s), neón (8 s).
    await stampWordAt(page, isMobile, 6);
    await expect(targetWord(page)).toHaveText('de');
    await stampWordAt(page, isMobile, 7);
    await expect(targetWord(page)).toHaveText('neón');
    await stampWordAt(page, isMobile, 8);
    await expect(targetWord(page)).toHaveText('brillan');
    await expect(undoButton(page, isMobile)).toBeEnabled();

    // Deshacer: el objetivo pasa a ser la 3ª palabra, sin marca; la 2ª sigue marcada.
    await undoButton(page, isMobile).click();
    await expect(targetWord(page)).toHaveText('neón');
    await expect(wordButton(page, 'de')).toHaveClass(/text-ok/);
    await expect(wordButton(page, 'neón')).not.toHaveClass(/text-ok/);

    // El audio retrocede inicio − Pre-Roll (≈ 5,5 s) y reproduce.
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          paused: window.__lrcAudioElement?.paused ?? true,
          time: window.__lrcAudioElement?.currentTime ?? -1,
        })),
      )
      .toMatchObject({ paused: false });
    const { time } = await page.evaluate(() => ({
      time: window.__lrcAudioElement?.currentTime ?? -1,
    }));
    expect(time).toBeGreaterThanOrEqual(8 - PRE_ROLL_S - 0.3);
    expect(time).toBeLessThanOrEqual(8 - PRE_ROLL_S + 1.5);

    // Siguen quedando marcas hacia atrás: deshacer de nuevo desmarca «de».
    await undoButton(page, isMobile).click();
    await expect(targetWord(page)).toHaveText('de');
    await expect(wordButton(page, 'Luces')).toHaveClass(/text-ok/);

    if (!isMobile) {
      // Atajos de escritorio: Backspace y Z también deshacen.
      await page.getByRole('button', { name: 'Pausar' }).first().click();
      await stampWordAt(page, isMobile, 7);
      await expect(targetWord(page)).toHaveText('neón');
      await page.keyboard.press('Backspace');
      await expect(targetWord(page)).toHaveText('de');
      await stampWordAt(page, isMobile, 7);
      await page.keyboard.press('z');
      await expect(targetWord(page)).toHaveText('de');
    }

    assertNoErrors();
  });

  test('cruza de línea al deshacer y la reproducción no mueve el foco', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile, 60);

    // Marcar las líneas 1 y 2 en modo Línea (2 s y 4 s) para tener líneas con tiempo.
    await setAudioTime(page, 2);
    await tapOrPointerDown(page, page.getByRole('button', { name: /MARCAR LÍNEA 1/i }), isMobile);
    await setAudioTime(page, 4);
    await tapOrPointerDown(page, page.getByRole('button', { name: /MARCAR LÍNEA 2/i }), isMobile);

    await selectSyncMode(page, 'Palabra');
    // El foco automático cae en la primera palabra sin marca (línea 3).
    await expect(targetWord(page)).toHaveText('Cada');

    // Reproducir cruzando la línea 1 → 2: el objetivo no cambia.
    await setAudioTime(page, 1.5);
    await page.evaluate(() => window.__lrcAudioElement?.play());
    await expect
      .poll(async () => page.evaluate(() => window.__lrcAudioElement?.currentTime ?? 0))
      .toBeGreaterThan(4.6);
    await expect(targetWord(page)).toHaveText('Cada');

    // Marcar toda la línea 3 (5 palabras): el foco cruza a la línea 4.
    const line3 = ['Cada', 'latido', 'marca', 'nuestra', 'canción'];
    for (let idx = 0; idx < line3.length; idx += 1) {
      await stampWordAt(page, isMobile, 20 + idx);
    }
    await expect(targetWord(page)).toHaveText('El');

    // Deshacer con el foco en (línea 4, palabra 0) sin marca: desmarca la última de la línea 3.
    await undoButton(page, isMobile).click();
    await expect(targetWord(page)).toHaveText('canción');
    await expect(wordButton(page, 'nuestra')).toHaveClass(/text-ok/);
    await expect(wordButton(page, 'canción')).not.toHaveClass(/text-ok/);

    // Deshacer el resto hasta quedarse sin marcas de palabra: el botón se desactiva.
    for (const word of ['nuestra', 'marca', 'latido', 'Cada']) {
      await undoButton(page, isMobile).click();
      await expect(targetWord(page)).toHaveText(word);
    }
    await expect(undoButton(page, isMobile)).toBeDisabled();

    assertNoErrors();
  });
});
