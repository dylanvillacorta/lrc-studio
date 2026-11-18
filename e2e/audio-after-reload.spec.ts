import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  trackErrors,
  waitForSaved,
} from './helpers/studio';

declare global {
  interface Window {
    __lrcAudioElement?: HTMLAudioElement | null;
  }
}

const AUDIO_SECONDS = 100;

function sliderOf(page: Page) {
  return page.getByRole('slider', { name: 'Posición en la forma de onda' });
}

async function displayedMs(page: Page): Promise<number> {
  return Number(await sliderOf(page).getAttribute('aria-valuenow'));
}

async function audioMs(page: Page): Promise<number> {
  return page.evaluate(() => (window.__lrcAudioElement?.currentTime ?? -1) * 1000);
}

async function liveAudioCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Set<HTMLAudioElement>([
        ...Array.from(document.querySelectorAll('audio')),
        ...(window.__lrcAudioElement ? [window.__lrcAudioElement] : []),
      ]).size,
  );
}

async function seekToFraction(page: Page, isMobile: boolean, fraction: number) {
  const slider = sliderOf(page);
  const box = await slider.boundingBox();
  expect(box).toBeTruthy();
  const pointerType = isMobile ? 'touch' : 'mouse';
  const base = { pointerId: 7, pointerType, isPrimary: true };
  await slider.dispatchEvent('pointerdown', {
    ...base,
    clientX: box!.x + box!.width * 0.3,
    clientY: box!.y + box!.height / 2,
  });
  const e = (await slider.boundingBox())!;
  const pos = { clientX: e.x + e.width * fraction, clientY: e.y + e.height / 2 };
  await slider.dispatchEvent('pointermove', { ...base, ...pos });
  await slider.dispatchEvent('pointerup', { ...base, ...pos });
}

test.describe('Audio sincronizado con el slider tras recargar (T26)', () => {
  test('tras recargar, el audio sigue al slider antes y después de reproducir', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile, AUDIO_SECONDS);
    await seekToFraction(page, isMobile, 0.6);
    await expect.poll(() => displayedMs(page)).toBeGreaterThan(40_000);
    await waitForSaved(page);

    await page.reload();
    await expect
      .poll(async () => Number(await sliderOf(page).getAttribute('aria-valuemax')))
      .toBeGreaterThan(60_000);
    await expect.poll(() => liveAudioCount(page)).toBe(1);

    // Seek del usuario tras recargar y antes del primer play: prevalece.
    await seekToFraction(page, isMobile, 0.2);
    await expect.poll(() => displayedMs(page)).toBeLessThan(30_000);
    const shown = await displayedMs(page);

    await page.getByRole('button', { name: 'Reproducir' }).first().click();
    await expect.poll(async () => (await audioMs(page)) >= shown - 100).toBe(true);
    await expect
      .poll(async () => Math.abs((await audioMs(page)) - shown))
      .toBeLessThan(5000);
    const first = await audioMs(page);
    await expect.poll(async () => (await audioMs(page)) > first + 200).toBe(true);

    // Seek durante la reproducción: el audio lo sigue.
    await seekToFraction(page, isMobile, 0.7);
    await expect
      .poll(async () => Math.abs((await audioMs(page)) - 70_000))
      .toBeLessThan(5000);

    // Pausar, mover y comprobar que el audio sigue al slider.
    await page.getByRole('button', { name: 'Pausar' }).first().click();
    await seekToFraction(page, isMobile, 0.4);
    await expect
      .poll(async () => Math.abs((await audioMs(page)) - (await displayedMs(page))))
      .toBeLessThan(300);
    await expect.poll(() => liveAudioCount(page)).toBe(1);

    assertNoErrors();
  });

  test('recargar y reproducir sin tocar el slider empieza en la posición mostrada', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile, AUDIO_SECONDS);
    await seekToFraction(page, isMobile, 0.5);
    await expect.poll(() => displayedMs(page)).toBeGreaterThan(40_000);
    await waitForSaved(page);

    await page.reload();
    await expect
      .poll(async () => Number(await sliderOf(page).getAttribute('aria-valuemax')))
      .toBeGreaterThan(60_000);
    const shown = await displayedMs(page);
    await page.getByRole('button', { name: 'Reproducir' }).first().click();
    await expect.poll(async () => (await audioMs(page)) >= shown - 100).toBe(true);
    await expect
      .poll(async () => Math.abs((await audioMs(page)) - shown))
      .toBeLessThan(5000);
    assertNoErrors();
  });
});
