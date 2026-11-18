import { expect, test } from '@playwright/test';
import {
  isMobileProject,
  loadDemoProject,
  selectSyncMode,
  tapOrPointerDown,
  trackErrors,
} from './helpers/studio';

function parseDisplayTimeToMs(text: string): number {
  const match = text.match(/(\d{2}):(\d{2})\.(\d{2})/);
  if (!match) {
    throw new Error(`Marca de tiempo inválida: ${text}`);
  }
  return Number(match[1]) * 60_000 + Number(match[2]) * 1000 + Number(match[3]) * 10;
}

const DEMO_LINES = [
  'Luces de neón brillan en la ciudad',
  'Caminamos juntos sin mirar atrás',
  'Cada latido marca nuestra canción',
  'El tiempo se detiene en tu voz',
  'Subimos el volumen hasta el amanecer',
  'Nada nos detiene hoy aquí',
] as const;

test.describe('Vista Karaoke sin saltos y tiempos exactos', () => {
  test('marca las 6 líneas en segundos conocidos, reproduce en Karaoke y avanza una a una sin saltarse ninguna', async ({
    page,
  }, testInfo) => {
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await loadDemoProject(page);

    const slider = page.getByRole('slider', { name: 'Posición en la forma de onda' });
    const durationMs = Number(await slider.getAttribute('aria-valuemax'));
    expect(durationMs).toBeGreaterThanOrEqual(28_000);

    const sliderBox = await slider.boundingBox();
    expect(sliderBox).not.toBeNull();

    const markedStartMs: number[] = [];
    const targetSecondsMs = [1200, 2400, 3600, 4800, 6000, 7200];

    // Seleccionar la primera línea y marcar las 6 líneas secuencialmente en tiempos conocidos
    const firstLineBtn = page.getByRole('button', {
      name: new RegExp(DEMO_LINES[0], 'i'),
    });
    await firstLineBtn.click();

    for (let i = 0; i < DEMO_LINES.length; i++) {
      const targetMs = targetSecondsMs[i]!;
      const ratio = targetMs / durationMs;
      await slider.scrollIntoViewIfNeeded();
      const currentSliderBox = await slider.boundingBox();
      expect(currentSliderBox).not.toBeNull();
      const clickX = currentSliderBox!.x + ratio * currentSliderBox!.width;
      const clickY = currentSliderBox!.y + currentSliderBox!.height / 2;

      await page.mouse.click(clickX, clickY);
      await expect
        .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
        .toBeGreaterThanOrEqual(targetMs - 200);

      const markBtn = page.getByRole('button', {
        name: new RegExp(`MARCAR LÍNEA ${i + 1}`, 'i'),
      });
      await tapOrPointerDown(page, markBtn, isMobile);

      const lineBtn = page.getByRole('button', {
        name: new RegExp(DEMO_LINES[i]!, 'i'),
      });
      await expect(lineBtn).toContainText(/\d{2}:\d{2}\.\d{2}/);
      const lineText = (await lineBtn.textContent()) ?? '';
      markedStartMs.push(parseDisplayTimeToMs(lineText));
    }

    // Volver al inicio (00:00.00) antes de abrir Karaoke
    const rewindBtn = page.getByRole('button', { name: 'Retroceder 5 segundos' }).first();
    await rewindBtn.click();
    await rewindBtn.click();
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
      .toBe(0);

    await selectSyncMode(page, 'Karaoke');
    await page.evaluate(() => window.scrollTo(0, 0));
    const karaokeRegion = page.getByRole('region', { name: 'Vista previa Karaoke' });
    await expect(karaokeRegion).toBeVisible();
    await expect(karaokeRegion.getByText('60 FPS')).toBeVisible();

    // Sin desbordamiento horizontal en el viewport actual
    const hasNoOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(hasNoOverflow).toBe(true);

    // Iniciar reproducción desde el control de Karaoke
    await karaokeRegion.getByRole('button', { name: 'Reproducir' }).click();
    await expect(karaokeRegion.getByRole('button', { name: 'Pausar' })).toBeVisible();

    const observedSequence: number[] = [];
    let screenshotTaken = false;

    await expect
      .poll(
        async () => {
          const snapshot = await page.evaluate(() => {
            const region = document.querySelector(
              'section[aria-label="Vista previa Karaoke"]',
            );
            if (!region) {
              return { activeIndices: [] as number[], timeText: '', scrollY: window.scrollY };
            }
            const items = Array.from(region.querySelectorAll('[data-state]'));
            const activeIndices: number[] = [];
            items.forEach((el, idx) => {
              if (el.getAttribute('data-state') === 'active') {
                activeIndices.push(idx);
              }
            });
            const timeEl = region.querySelector('[aria-label="Tiempo actual"]');
            return {
              activeIndices,
              timeText: timeEl?.textContent ?? '',
              scrollY: window.scrollY,
            };
          });

          // La página principal no debe desplazarse nunca por el scroll interno del Karaoke
          expect(snapshot.scrollY).toBe(0);
          // A lo sumo una línea activa por fotograma
          expect(snapshot.activeIndices.length).toBeLessThanOrEqual(1);

          if (snapshot.activeIndices.length === 1) {
            const activeIdx = snapshot.activeIndices[0]!;
            const lastObserved = observedSequence[observedSequence.length - 1];
            if (lastObserved === undefined) {
              expect(activeIdx).toBe(0);
              observedSequence.push(activeIdx);
            } else if (activeIdx !== lastObserved) {
              expect(activeIdx).toBe(lastObserved + 1);
              observedSequence.push(activeIdx);
            }

            const currentMs = parseDisplayTimeToMs(snapshot.timeText);
            const expectedStart = markedStartMs[activeIdx]!;
            expect(currentMs).toBeGreaterThanOrEqual(Math.max(0, expectedStart - 120));

            if (!screenshotTaken && activeIdx >= 2) {
              screenshotTaken = true;
              await page.screenshot({
                path: `test-results/karaoke-${testInfo.project.name}.png`,
              });
            }
          }

          return observedSequence.length;
        },
        { timeout: 12_000, intervals: [60] },
      )
      .toBe(DEMO_LINES.length);

    expect(observedSequence).toEqual([0, 1, 2, 3, 4, 5]);

    if (!screenshotTaken) {
      await page.screenshot({
        path: `test-results/karaoke-${testInfo.project.name}.png`,
      });
    }

    // Pausar y comprobar vista móvil estrecha 360x640 sin desbordamiento
    await karaokeRegion.getByRole('button', { name: 'Pausar' }).click();
    if (isMobile) {
      await page.setViewportSize({ width: 360, height: 640 });
      await expect(karaokeRegion).toBeVisible();
      const noSmallOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(noSmallOverflow).toBe(true);
      await page.screenshot({
        path: 'test-results/karaoke-mobile-360x640.png',
      });
    }

    assertNoErrors();
  });
});
