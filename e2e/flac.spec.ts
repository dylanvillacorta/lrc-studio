import { expect, test } from '@playwright/test';
import { createTinyFlacBytes } from './helpers/flac';
import {
  isMobileProject,
  openCatalog,
  trackErrors,
  waitForSaved,
} from './helpers/studio';
import { makeFilePayload, readDownloadText } from './helpers/wav';

test.describe('Soporte de audio FLAC', () => {
  test('sube un .flac válido, dibuja onda, reproduce, sobrevive a recarga con mime audio/flac y exporta respaldo', async ({
    page,
  }, testInfo) => {
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);
    const flacBytes = createTinyFlacBytes(1);

    await page.goto('/');
    await openCatalog(page, isMobile);
    const catalogRegion = page.getByRole('region', { name: 'Mis transcripciones' });
    await catalogRegion.getByRole('button', { name: 'Nueva transcripción' }).click();
    await expect(page.getByRole('region', { name: 'Sin pista de audio' })).toBeVisible();

    const fileInput = page.locator('input[aria-label="Seleccionar archivo de audio"]');
    await expect(fileInput).toHaveAttribute('accept', /\.flac/);
    await fileInput.setInputFiles(
      makeFilePayload('master-estudio.flac', 'audio/flac', flacBytes),
    );

    // Verifica que la onda se dibuja y la duración (~1000 ms) es correcta
    const slider = page.getByRole('slider', { name: 'Posición en la forma de onda' });
    await expect(slider).toBeVisible();
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuemax')))
      .toBeGreaterThanOrEqual(900);
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuemax')))
      .toBeLessThanOrEqual(1100);

    // Verifica reproducción real
    const playBtn = page.getByRole('button', { name: 'Reproducir' });
    await expect(playBtn).toBeVisible();
    await playBtn.click();
    await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
    await page.getByRole('button', { name: 'Pausar' }).click();

    await waitForSaved(page);

    // Recarga y verifica restauración de duración y MIME audio/flac en IndexedDB
    await page.reload();
    const reloadedSlider = page.getByRole('slider', { name: 'Posición en la forma de onda' });
    await expect(reloadedSlider).toBeVisible();
    await expect
      .poll(async () => Number(await reloadedSlider.getAttribute('aria-valuemax')))
      .toBeGreaterThanOrEqual(900);

    const storedRecord = await page.evaluate(async () => {
      return new Promise<{ mime: string; fileName: string; magic: string } | null>((resolve, reject) => {
        const req = indexedDB.open('lyricsync-studio', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('audio', 'readonly');
          const getAll = tx.objectStore('audio').getAll();
          getAll.onerror = () => reject(getAll.error);
          getAll.onsuccess = () => {
            const first = getAll.result[0] as
              | { mime: string; fileName: string; buffer: ArrayBuffer }
              | undefined;
            if (!first) {
              resolve(null);
              return;
            }
            const header = Array.from(new Uint8Array(first.buffer).slice(0, 4))
              .map((b) => String.fromCharCode(b))
              .join('');
            resolve({ mime: first.mime, fileName: first.fileName, magic: header });
          };
        };
      });
    });

    expect(storedRecord).toEqual({
      mime: 'audio/flac',
      fileName: 'master-estudio.flac',
      magic: 'fLaC',
    });

    // Verifica exportación de respaldo .json con mimeType audio/flac
    await openCatalog(page, isMobile);
    const card = catalogRegion.getByRole('article').first();
    await expect(card).toContainText('master-estudio.flac');
    const downloadPromise = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Exportar respaldo .json' }).click();
    const download = await downloadPromise;
    const backupText = await readDownloadText(download);
    const backup = JSON.parse(backupText) as {
      audios: { fileName: string; mimeType: string }[];
    };
    expect(backup.audios[0]?.fileName).toBe('master-estudio.flac');
    expect(backup.audios[0]?.mimeType).toBe('audio/flac');

    assertNoErrors();
  });

  test('muestra error claro en español ante archivo no-audio o .txt renombrado sin alterar el proyecto', async ({
    page,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await openCatalog(page, isMobile);
    const catalogRegion = page.getByRole('region', { name: 'Mis transcripciones' });
    await catalogRegion.getByRole('button', { name: 'Nueva transcripción' }).click();
    await expect(page.getByRole('region', { name: 'Sin pista de audio' })).toBeVisible();

    const fileInput = page.locator('input[aria-label="Seleccionar archivo de audio"]');

    // Caso 1: archivo no-audio (.txt)
    await fileInput.setInputFiles(
      makeFilePayload('notas.txt', 'text/plain', 'esto no es audio'),
    );
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/FLAC/);
    await expect(page.getByRole('region', { name: 'Sin pista de audio' })).toBeVisible();

    // Caso 2: archivo .txt renombrado a .flac (falla decodeAudioData)
    await fileInput.setInputFiles(
      makeFilePayload('falso.flac', 'audio/flac', 'contenido invalido no flac'),
    );
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/no pudo decodificar/i);
    await expect(page.getByRole('region', { name: 'Sin pista de audio' })).toBeVisible();
  });
});
