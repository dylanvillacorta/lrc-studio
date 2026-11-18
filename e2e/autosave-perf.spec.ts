import { expect, test } from '@playwright/test';
import {
  isMobileProject,
  loadDemoProject,
  openExport,
  openLyrics,
  openSyncEditor,
  selectSyncMode,
  tapOrPointerDown,
  waitForSaved,
} from './helpers/studio';

declare global {
  interface Window {
    __t23Stats?: {
      savingTransitions: number;
      headerMutations: number;
      lineListMutations: number;
      disconnect: () => void;
    };
  }
}

test.describe('T23: guardado sin parpadeo y estabilidad de render durante reproducción', () => {
  test('cambiar de modo/pestaña y reproducir audio no disparan Guardando ni repintan cabecera/lista; marcar sí guarda y persiste', async ({
    page,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    await page.goto('/');
    await loadDemoProject(page);
    await waitForSaved(page);

    const installObservers = async () => {
      await page.evaluate(() => {
        window.__t23Stats?.disconnect();
        const header = document.querySelector('header');
        const lineBtn = Array.from(document.querySelectorAll('button')).find((b) =>
          b.textContent?.includes('Subimos el volumen hasta el amanecer'),
        );
        const lineList = lineBtn?.parentElement ?? null;

        const stats = {
          savingTransitions: 0,
          headerMutations: 0,
          lineListMutations: 0,
          disconnect: () => {},
        };

        const observers: MutationObserver[] = [];

        if (header) {
          const obsHeader = new MutationObserver(() => {
            stats.headerMutations += 1;
            if (header.textContent?.includes('Guardando')) {
              stats.savingTransitions += 1;
            }
          });
          obsHeader.observe(header, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
          });
          observers.push(obsHeader);
        }

        if (lineList) {
          const obsList = new MutationObserver(() => {
            stats.lineListMutations += 1;
          });
          obsList.observe(lineList, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
          });
          observers.push(obsList);
        }

        stats.disconnect = () => {
          for (const o of observers) o.disconnect();
        };
        window.__t23Stats = stats;
      });
    };

    await installObservers();

    // 1. Cambiar entre modos y pestañas sin editar nada: el indicador nunca debe pasar a Guardando.
    await selectSyncMode(page, 'Palabra');
    await selectSyncMode(page, 'Ráfaga');
    await expect(page.getByRole('button', { name: 'Detener ráfaga' })).toBeVisible();
    await page.getByRole('button', { name: 'Detener ráfaga' }).click();
    await selectSyncMode(page, 'Karaoke');
    await selectSyncMode(page, 'Línea');
    await openLyrics(page, isMobile);
    await openExport(page, isMobile);
    await openSyncEditor(page, isMobile);

    await waitForSaved(page);
    const afterModes = await page.evaluate(() => window.__t23Stats?.savingTransitions ?? -1);
    expect(afterModes).toBe(0);

    // 2. Reproducir audio ~2 segundos: ni Guardando ni mutaciones DOM en cabecera/lista de líneas.
    await installObservers();
    const slider = page.getByRole('slider', { name: 'Posición en la forma de onda' });
    const startVal = Number(await slider.getAttribute('aria-valuenow'));

    await page.getByRole('button', { name: 'Reproducir' }).click();
    await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();

    // Verificar con expect.poll que el tiempo avanza y que el indicador permanece en Guardado.
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')), {
        timeout: 5000,
      })
      .toBeGreaterThan(startVal + 1200);

    await expect
      .poll(async () => {
        const headerText = await page.locator('header').textContent();
        return headerText?.includes('Guardado') && !headerText.includes('Guardando');
      })
      .toBe(true);

    await page.getByRole('button', { name: 'Pausar' }).click();
    await expect(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();

    // Esperar ventana de debounce silencioso (1 s) para confirmar que tampoco aparece Guardando tras pausar.
    await page.waitForTimeout(1100);

    const playbackStats = await page.evaluate(() => ({
      savingTransitions: window.__t23Stats?.savingTransitions ?? -1,
      headerMutations: window.__t23Stats?.headerMutations ?? -1,
      lineListMutations: window.__t23Stats?.lineListMutations ?? -1,
    }));

    expect(playbackStats.savingTransitions).toBe(0);
    // Solo se esperan como mucho 0 mutaciones en lista de líneas y en el indicador de header durante reproducción
    // (el botón Play/Pausar vive fuera de <header> y de la lista de líneas).
    expect(playbackStats.headerMutations).toBe(0);
    expect(playbackStats.lineListMutations).toBe(0);

    // 3. Al marcar una línea (cambio real del proyecto), sí pasa por Guardando -> Guardado y sobrevive a recarga.
    const line5 = page.getByRole('button', {
      name: /Subimos el volumen hasta el amanecer/i,
    });
    await line5.click();
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await tapOrPointerDown(
      page,
      page.getByRole('button', { name: /MARCAR LÍNEA 5/i }),
      isMobile,
    );

    await expect
      .poll(() => page.evaluate(() => window.__t23Stats?.savingTransitions ?? 0))
      .toBeGreaterThanOrEqual(1);
    await waitForSaved(page);

    const markedTimeText = await line5.textContent();
    expect(markedTimeText).toMatch(/\d{2}:\d{2}\.\d{2}/);

    await page.reload();
    const reloadedLine5 = page.getByRole('button', {
      name: /Subimos el volumen hasta el amanecer/i,
    });
    await expect(reloadedLine5).toContainText(/\d{2}:\d{2}\.\d{2}/);
  });
});
