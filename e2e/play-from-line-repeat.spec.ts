import { expect, test } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  tapOrPointerDown,
  trackErrors,
} from './helpers/studio';

declare global {
  interface Window {
    __lrcAudioElement?: HTMLAudioElement | null;
    __lrcSeekTargets?: number[];
  }
}

test.describe('Reproducir desde aquí es idempotente y exacto', () => {
  test('6 toques seguidos siempre suenan desde la marca, sin pausar ni recargar', async ({
    page,
  }, testInfo) => {
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile, 60);

    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await tapOrPointerDown(page, page.getByRole('button', { name: /MARCAR LÍNEA 1/i }), isMobile);

    const line1 = page.getByRole('button', { name: /Luces de neón brillan en la ciudad/i });
    await expect(line1).toContainText(/\d\d:\d\d\.\d\d/);
    const label = (await line1.textContent()) ?? '';
    const match = /(\d\d):(\d\d)\.(\d\d)/.exec(label);
    expect(match).not.toBeNull();
    const markMs =
      Number(match?.[1]) * 60_000 + Number(match?.[2]) * 1000 + Number(match?.[3]) * 10;
    expect(markMs).toBeGreaterThan(4000);

    await line1.click();

    const srcBefore = await page.evaluate(() => {
      const audio = window.__lrcAudioElement;
      window.__lrcSeekTargets = [];
      audio?.addEventListener('seeking', () => {
        window.__lrcSeekTargets?.push(Math.round(audio.currentTime * 1000));
      });
      return audio?.src ?? '';
    });
    expect(srcBefore).not.toBe('');

    const delays = [400, 650, 900, 500, 750, 450];
    for (const [index, delay] of delays.entries()) {
      // Se aleja la aguja para que cada toque tenga que saltar de verdad.
      await page.evaluate((ms) => {
        const audio = window.__lrcAudioElement;
        if (audio) audio.currentTime = ms / 1000;
      }, 30_000 + index * 1000);
      await page.evaluate(() => {
        window.__lrcSeekTargets = [];
      });
      await page.getByRole('button', { name: 'Reproducir desde aquí' }).click();
      await expect(page.getByRole('button', { name: 'Pausar' }).first()).toBeVisible();
      await expect(page.getByText('Preparando audio…')).toHaveCount(0);
      // El último `seeking` es el del toque: salta al milisegundo de la marca (±30 ms).
      await expect
        .poll(
          async () => {
            const targets = await page.evaluate(() => window.__lrcSeekTargets ?? []);
            return Math.abs((targets[targets.length - 1] ?? -1_000_000) - markMs);
          },
          { message: `toque ${index + 1}: salto a la marca` },
        )
        .toBeLessThanOrEqual(30);
      const paused = await page.evaluate(() => window.__lrcAudioElement?.paused ?? true);
      expect(paused, `toque ${index + 1}: debe sonar`).toBe(false);
      await page.waitForTimeout(delay);
      const stillPlaying = await page.evaluate(
        () => !(window.__lrcAudioElement?.paused ?? true),
      );
      expect(stillPlaying, `toque ${index + 1}: sigue sonando`).toBe(true);
    }

    const srcAfter = await page.evaluate(() => window.__lrcAudioElement?.src ?? '');
    expect(srcAfter).toBe(srcBefore);
    assertNoErrors();
  });
});
