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
const REPAIR_SCENARIOS: Array<{
  name: string;
  trigger: (page: Page) => Promise<void>;
  expectRepair: boolean;
  /** Cargar un blob revocado registra un error de red esperado en consola. */
  expectsConsoleNoise?: boolean;
}> = [
  {
    name: 'volver del segundo plano (visibilitychange hidden y visible)',
    expectRepair: false,
    trigger: async (page) => {
      await page.evaluate(() => {
        const set = (state: string) => {
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => state,
          });
          document.dispatchEvent(new Event('visibilitychange'));
        };
        set('hidden');
        set('visible');
      });
    },
  },
  {
    name: 'bfcache (pageshow persisted)',
    expectRepair: true,
    trigger: async (page) => {
      await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
    },
  },
  {
    name: 'error del elemento Audio',
    expectRepair: true,
    trigger: async (page) => {
      await page.evaluate(() => {
        window.__lrcAudioElement?.dispatchEvent(new Event('error'));
      });
    },
  },
  {
    name: 'emptied del elemento Audio',
    expectRepair: true,
    trigger: async (page) => {
      await page.evaluate(() => {
        window.__lrcAudioElement?.dispatchEvent(new Event('emptied'));
      });
    },
  },
  {
    name: 'blob URL revocado a propósito',
    expectRepair: true,
    expectsConsoleNoise: true,
    trigger: async (page) => {
      await page.evaluate(() => {
        URL.revokeObjectURL(window.__lrcAudioElement!.src);
        const set = (state: string) => {
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => state,
          });
          document.dispatchEvent(new Event('visibilitychange'));
        };
        set('hidden');
        set('visible');
      });
      const url = await page.evaluate(() => window.__lrcAudioElement!.src);
      await expect
        .poll(() =>
          page.evaluate(
            (u) => fetch(u).then(() => true, () => false),
            url,
          ),
        )
        .toBe(false);
    },
  },
];

test.describe('Auto-reparación del audio (T26)', () => {
  for (const scenario of REPAIR_SCENARIOS) {
    test(`${scenario.name}: el siguiente play suena desde la barra y el slider sigue moviendo el audio`, async ({
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

      await expect
        .poll(() => page.evaluate(() => window.__lrcAudioElement?.readyState ?? 0))
        .toBeGreaterThanOrEqual(1);
      const srcBefore = await page.evaluate(() => window.__lrcAudioElement!.src);
      await scenario.trigger(page);
      await seekToFraction(page, isMobile, 0.3);
      await expect.poll(() => displayedMs(page)).toBeLessThan(40_000);
      const shown = await displayedMs(page);

      await page.getByRole('button', { name: 'Reproducir' }).first().click();
      await expect.poll(async () => (await audioMs(page)) >= shown - 100).toBe(true);
      await expect
        .poll(async () => Math.abs((await audioMs(page)) - shown))
        .toBeLessThan(5000);
      const first = await audioMs(page);
      await expect.poll(async () => (await audioMs(page)) > first + 200).toBe(true);

      const srcAfter = await page.evaluate(() => window.__lrcAudioElement!.src);
      if (scenario.expectRepair) {
        expect(srcAfter).not.toBe(srcBefore);
        // La URL anterior debe haberse revocado y no quedan elementos duplicados.
      }
      expect(await liveAudioCount(page)).toBe(1);
      await expect(page.getByRole('status', { name: /Preparando audio/ })).toHaveCount(0);

      // El slider sigue moviendo el audio tras la reparación.
      await seekToFraction(page, isMobile, 0.8);
      await expect
        .poll(async () => Math.abs((await audioMs(page)) - 80_000))
        .toBeLessThan(5000);
      await page.getByRole('button', { name: 'Pausar' }).first().click();
      await seekToFraction(page, isMobile, 0.4);
      await expect
        .poll(async () => Math.abs((await audioMs(page)) - (await displayedMs(page))))
        .toBeLessThan(300);

      if (!scenario.expectsConsoleNoise) {
        assertNoErrors();
      }
    });
  }
});

test.describe('Vigilante de progreso: audio congelado (T26)', () => {
  async function freezeAudio(page: Page) {
    await page.evaluate(() => {
      const audio = window.__lrcAudioElement!;
      const frozenSrc = audio.src;
      const frozenAt = audio.currentTime;
      const desc = Object.getOwnPropertyDescriptor(
        HTMLMediaElement.prototype,
        'currentTime',
      )!;
      // Simula iOS: paused=false, sin eventos ni error, pero currentTime no avanza
      // (hasta que el elemento recibe un src nuevo tras la reparación).
      Object.defineProperty(audio, 'currentTime', {
        configurable: true,
        get() {
          return audio.src === frozenSrc ? frozenAt : desc.get!.call(audio);
        },
        set(value: number) {
          if (audio.src !== frozenSrc) desc.set!.call(audio, value);
        },
      });
    });
  }

  for (const via of ['vigilante periódico', 'volver a visible'] as const) {
    test(`audio congelado (${via}): pasa a pausa visible, repara y el siguiente play suena`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      const assertNoErrors = trackErrors(page);
      const isMobile = isMobileProject(testInfo);

      await page.goto('/');
      await createProjectWithLyricsAndWav(page, isMobile, AUDIO_SECONDS);
      await seekToFraction(page, isMobile, 0.3);
      await expect.poll(() => displayedMs(page)).toBeGreaterThan(20_000);
      await page.getByRole('button', { name: 'Reproducir' }).first().click();
      await expect.poll(async () => (await audioMs(page)) > 30_000).toBe(true);
      const srcBefore = await page.evaluate(() => window.__lrcAudioElement!.src);

      await freezeAudio(page);
      if (via === 'volver a visible') {
        await page.evaluate(() => {
          const set = (state: string) => {
            Object.defineProperty(document, 'visibilityState', {
              configurable: true,
              get: () => state,
            });
            document.dispatchEvent(new Event('visibilitychange'));
          };
          set('hidden');
          set('visible');
        });
      }

      // El estado visible se corrige: ya no dice que reproduce (botón Reproducir listo).
      await expect(page.getByRole('button', { name: 'Reproducir' }).first()).toBeVisible({
        timeout: 8000,
      });
      // La reparación ocurre: nuevo blob URL, un solo elemento Audio.
      await expect
        .poll(() => page.evaluate(() => window.__lrcAudioElement!.src))
        .not.toBe(srcBefore);
      await expect.poll(() => liveAudioCount(page)).toBe(1);

      const shown = await displayedMs(page);
      await page.getByRole('button', { name: 'Reproducir' }).first().click();
      await expect.poll(async () => (await audioMs(page)) >= shown - 100).toBe(true);
      const first = await audioMs(page);
      await expect.poll(async () => (await audioMs(page)) > first + 300).toBe(true);
      await expect(page.getByRole('button', { name: 'Pausar' }).first()).toBeVisible();

      assertNoErrors();
    });
  }
});
