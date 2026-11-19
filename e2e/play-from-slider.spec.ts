import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  openLyrics,
  openSyncEditor,
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

async function seekToFraction(page: Page, isMobile: boolean, fraction: number) {
  const slider = sliderOf(page);
  const box = await slider.boundingBox();
  expect(box).toBeTruthy();
  const pointerType = isMobile ? 'touch' : 'mouse';
  const y = box!.y + box!.height / 2;
  await slider.dispatchEvent('pointerdown', {
    pointerId: 7,
    pointerType,
    clientX: box!.x + box!.width * 0.3,
    clientY: y,
    isPrimary: true,
  });
  const expanded = (await slider.boundingBox())!;
  const x = expanded.x + expanded.width * fraction;
  const ey = expanded.y + expanded.height / 2;
  await slider.dispatchEvent('pointermove', {
    pointerId: 7,
    pointerType,
    clientX: x,
    clientY: ey,
    isPrimary: true,
  });
  await slider.dispatchEvent('pointerup', {
    pointerId: 7,
    pointerType,
    clientX: x,
    clientY: ey,
    isPrimary: true,
  });
}

async function expectPlayingFromDisplayed(page: Page, shownMs: number) {
  await page.getByRole('button', { name: 'Reproducir' }).first().click();
  await expect
    .poll(async () => (await audioMs(page)) >= shownMs - 100)
    .toBe(true);
  const first = await audioMs(page);
  await expect.poll(async () => (await audioMs(page)) > first + 200).toBe(true);
  // La interfaz debe seguir al audio, no al revés.
  await expect
    .poll(async () => Math.abs((await displayedMs(page)) - (await audioMs(page))))
    .toBeLessThan(1500);
}

test.describe('Reproducir desde el tiempo mostrado en el slider (T25)', () => {
  test('seek en pausa, seek en reproducción, recarga y cambio de pestaña', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile, AUDIO_SECONDS);

    // 1. Seek en pausa al 60 % antes de la primera reproducción.
    await seekToFraction(page, isMobile, 0.6);
    await expect.poll(async () => displayedMs(page)).toBeGreaterThan(40_000);
    const shown1 = await displayedMs(page);
    await expectPlayingFromDisplayed(page, shown1);

    // 2. Seek durante la reproducción.
    await seekToFraction(page, isMobile, 0.3);
    await expect
      .poll(async () => Math.abs((await audioMs(page)) - 30_000))
      .toBeLessThan(5000);
    const shown2 = await displayedMs(page);
    await expect.poll(async () => (await audioMs(page)) >= shown2 - 100).toBe(true);

    // 3. Pausar, mover y reproducir de nuevo.
    await page.getByRole('button', { name: 'Pausar' }).first().click();
    await seekToFraction(page, isMobile, 0.6);
    await waitForSaved(page);
    const shown3 = await displayedMs(page);
    await expectPlayingFromDisplayed(page, shown3);
    await page.getByRole('button', { name: 'Pausar' }).first().click();

    // 4. Cambio de pestaña y vuelta.
    await seekToFraction(page, isMobile, 0.5);
    const shown4 = await displayedMs(page);
    await openLyrics(page, isMobile);
    await openSyncEditor(page, isMobile);
    await expect(sliderOf(page)).toBeVisible();
    const shownAfterTab = await displayedMs(page);
    expect(Math.abs(shownAfterTab - shown4)).toBeLessThan(200);
    await expectPlayingFromDisplayed(page, shownAfterTab);
    await page.getByRole('button', { name: 'Pausar' }).first().click();

    // 5. Recarga con sesión restaurada.
    await seekToFraction(page, isMobile, 0.6);
    await waitForSaved(page);
    await page.reload();
    await expect
      .poll(async () => Number(await sliderOf(page).getAttribute('aria-valuemax')))
      .toBeGreaterThan(60_000);
    const shown5 = await displayedMs(page);
    await expectPlayingFromDisplayed(page, shown5);

    assertNoErrors();
  });
});
