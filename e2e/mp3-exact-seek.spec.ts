import { expect, test, type Page } from '@playwright/test';
import {
  isMobileProject,
  openCatalog,
  openLyrics,
  openSyncEditor,
  tapOrPointerDown,
  trackErrors,
  waitForSaved,
} from './helpers/studio';
import { readDownloadText } from './helpers/wav';

declare global {
  interface Window {
    __lrcAudioElement?: HTMLAudioElement | null;
    __lrcSeekTargets?: number[];
  }
}

// MP3 VBR mono de 8 s (tono de 440 Hz) generado con ffmpeg/libmp3lame -q:a 9. No es una dependencia.
const MP3_FIXTURE = 'e2e/fixtures/seek-tone-vbr.mp3';
const MP3_FIXTURE_BYTES = 32_658;

interface AudioSourceInfo {
  type: string;
  size: number;
  magic: string;
}

async function playbackSource(page: Page): Promise<AudioSourceInfo> {
  return page.evaluate(async () => {
    const response = await fetch(window.__lrcAudioElement!.src);
    const blob = await response.blob();
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    return {
      type: blob.type,
      size: blob.size,
      magic: String.fromCharCode(...head),
    };
  });
}

async function storedLineStartMs(page: Page): Promise<number> {
  return page.evaluate(async () => {
    return new Promise<number>((resolve, reject) => {
      const req = indexedDB.open('lyricsync-studio', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const getAll = req.result.transaction('projects', 'readonly').objectStore('projects').getAll();
        getAll.onerror = () => reject(getAll.error);
        getAll.onsuccess = () => {
          const record = getAll.result[0] as { lines?: { startMs: number | null }[] } | undefined;
          resolve(record?.lines?.[0]?.startMs ?? -1);
        };
      };
    });
  });
}

test.describe('Salto exacto con MP3 (proxy WAV PCM)', () => {
  test('MP3 importado suena desde un WAV, salta a la marca (<=5 ms), sobrevive a recarga y se respalda sin cambios', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await openLyrics(page, isMobile);
    await page.getByLabel('Título de la canción').fill('Tono MP3');
    await page.getByLabel('Artista').fill('Prueba');
    await page
      .getByLabel('Letra de la canción, una línea por verso')
      .fill('Primera línea del tono\nSegunda línea del tono');
    await page.getByRole('button', { name: 'Aplicar letra' }).click();
    await openSyncEditor(page, isMobile);
    await page.locator('input[aria-label="Seleccionar archivo de audio"]').setInputFiles(MP3_FIXTURE);

    await expect(page.getByRole('button', { name: /MARCAR LÍNEA/i })).toBeVisible();
    const slider = page.getByRole('slider', { name: 'Posición en la forma de onda' });
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuemax')))
      .toBeGreaterThan(7_700);
    expect(Number(await slider.getAttribute('aria-valuemax'))).toBeLessThan(8_300);
    await expect(page.getByText('Preparando audio…')).toHaveCount(0);

    // El <audio> suena desde un WAV PCM RIFF, no desde el MP3.
    const source = await playbackSource(page);
    expect(source.type).toBe('audio/wav');
    expect(source.magic).toBe('RIFF');
    expect(source.size).toBeGreaterThan(8 * 44_100 * 2 * 0.95);

    // Marcar la línea 1 y saltar a la marca: currentTime a <= 5 ms.
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await tapOrPointerDown(page, page.getByRole('button', { name: /MARCAR LÍNEA 1/i }), isMobile);
    const line1 = page.getByRole('button', { name: /Primera línea del tono/i });
    await expect(line1).toContainText(/\d\d:\d\d\.\d\d/);
    await waitForSaved(page);
    const markMs = await storedLineStartMs(page);
    expect(markMs).toBeGreaterThan(4_000);

    await line1.click();
    await page.evaluate(() => {
      const audio = window.__lrcAudioElement!;
      window.__lrcSeekTargets = [];
      audio.addEventListener('seeking', () => {
        window.__lrcSeekTargets!.push(audio.currentTime * 1000);
      });
      audio.currentTime = 1;
    });
    await page.getByRole('button', { name: 'Reproducir desde aquí' }).click();
    await expect
      .poll(async () => {
        const targets = await page.evaluate(() => window.__lrcSeekTargets ?? []);
        return Math.abs((targets[targets.length - 1] ?? -1_000_000) - markMs);
      })
      .toBeLessThanOrEqual(5);
    await page.getByRole('button', { name: 'Pausar' }).first().click();

    // Tras recargar (restaurar) vuelve a sonar desde el WAV.
    await waitForSaved(page);
    await page.reload();
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuemax')))
      .toBeGreaterThan(7_700);
    await expect.poll(() => page.evaluate(() => window.__lrcAudioElement?.readyState ?? 0)).toBeGreaterThanOrEqual(1);
    const restored = await playbackSource(page);
    expect(restored.type).toBe('audio/wav');
    expect(restored.magic).toBe('RIFF');

    // El blob original sigue guardado sin cambios.
    const stored = await page.evaluate(async () => {
      return new Promise<{ mime: string; size: number }>((resolve, reject) => {
        const req = indexedDB.open('lyricsync-studio', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const getAll = req.result.transaction('audio', 'readonly').objectStore('audio').getAll();
          getAll.onerror = () => reject(getAll.error);
          getAll.onsuccess = () => {
            const first = getAll.result[0] as { mime: string; buffer: ArrayBuffer };
            resolve({ mime: first.mime, size: first.buffer.byteLength });
          };
        };
      });
    });
    expect(stored).toEqual({ mime: 'audio/mpeg', size: MP3_FIXTURE_BYTES });

    // El respaldo conserva el MP3 original.
    await openCatalog(page, isMobile);
    const card = page.getByRole('region', { name: 'Mis transcripciones' }).getByRole('article').first();
    const downloadPromise = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Exportar respaldo .json' }).click();
    const backup = JSON.parse(await readDownloadText(await downloadPromise)) as {
      audios: { fileName: string; mimeType: string }[];
    };
    expect(backup.audios[0]?.fileName).toBe('seek-tone-vbr.mp3');
    expect(backup.audios[0]?.mimeType).toBe('audio/mpeg');

    assertNoErrors();
  });
});
