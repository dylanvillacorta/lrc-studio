import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  trackErrors,
} from './helpers/studio';

declare global {
  interface Window {
    __lrcAudioElement?: HTMLAudioElement | null;
    __lrcSeekCount?: number;
  }
}

const AUDIO_SECONDS = 100;

function sliderOf(page: Page) {
  return page.getByRole('slider', { name: 'Posición en la forma de onda' });
}

async function audioState(page: Page) {
  return page.evaluate(() => {
    const audio = window.__lrcAudioElement;
    return {
      currentTime: audio?.currentTime ?? -1,
      duration: audio?.duration ?? -1,
    };
  });
}

test.describe('Precisión del toque en la franja de onda', () => {
  test('tocar una fracción de la caja medida antes de tocar deja currentTime ≈ fracción × duración con un solo seek', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile, AUDIO_SECONDS);

    await page.evaluate(() => {
      window.__lrcSeekCount = 0;
      window.__lrcAudioElement?.addEventListener('seeking', () => {
        window.__lrcSeekCount = (window.__lrcSeekCount ?? 0) + 1;
      });
    });

    for (const fraction of [0.25, 0.75]) {
      const slider = sliderOf(page);
      // Esperar a que la franja vuelva a su estado compacto: la caja se mide antes de tocar.
      await expect(slider).toHaveAttribute('data-expanded', 'false', { timeout: 4000 });
      const box = await slider.boundingBox();
      expect(box).toBeTruthy();
      const x = box!.x + box!.width * fraction;
      const y = box!.y + box!.height / 2;

      await page.evaluate(() => {
        window.__lrcSeekCount = 0;
      });

      if (isMobile) {
        await page.touchscreen.tap(x, y);
      } else {
        await page.mouse.click(x, y);
      }

      await expect
        .poll(async () => {
          const { currentTime, duration } = await audioState(page);
          return duration > 0 ? Math.abs(currentTime / duration - fraction) : 1;
        })
        .toBeLessThanOrEqual(0.01);

      // Un solo seek por toque, incluso tras expandirse y soltar.
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.__lrcSeekCount)).toBe(1);
      const { currentTime, duration } = await audioState(page);
      expect(Math.abs(currentTime / duration - fraction)).toBeLessThanOrEqual(0.01);
    }

    assertNoErrors();
  });
});
