import { expect, test, type Page } from '@playwright/test';
import { isMobileProject, openCatalog } from './helpers/studio';
import { readDownloadText } from './helpers/wav';

const DAMAGED_RECORD = {
  id: 'dañado-1',
  title: 'Canción dañada',
  artist: 'Nadie',
  schemaVersion: 99,
  lines: 'esto no es una lista',
  datosRaros: { conservar: true },
};

async function seedDamagedProject(page: Page): Promise<void> {
  await page.evaluate(async (record) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('lyricsync-studio');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem(
      'lyricsync:session',
      JSON.stringify({
        projectId: record.id,
        activeTab: 'sync',
        currentTime: 0,
        activeLineIndex: 0,
        activeWordIndex: 0,
        updatedAt: Date.now(),
      }),
    );
  }, DAMAGED_RECORD);
}

async function readRawRecord(page: Page): Promise<unknown> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('lyricsync-studio');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const value = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction('projects', 'readonly').objectStore('projects').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  }, DAMAGED_RECORD.id);
}

test.describe('Proyecto guardado que no se puede restaurar', () => {
  test('avisa, ofrece descargar el original crudo y conserva el registro', async ({ page }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    await page.goto('/');
    await page.waitForFunction(async () =>
      (await indexedDB.databases()).some((d) => d.name === 'lyricsync-studio'),
    );
    // Se siembra desde un documento estático del mismo origen para que el vaciado de la sesión de la
    // página anterior (al descargarse) no pise la sesión sembrada.
    await page.goto('/manifest.webmanifest');
    // Margen para que terminen los guardados de sesión pendientes de la página anterior.
    await page.waitForTimeout(500);
    await seedDamagedProject(page);
    await page.goto('/');

    const notice = page.getByTestId('restore-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('No se puede restaurar');
    await expect(notice).toContainText('Canción dañada');

    await openCatalog(page, isMobile);
    const catalogRegion = page.getByRole('region', { name: 'Mis transcripciones' });
    const card = catalogRegion.getByTestId('unrestorable-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('No se puede restaurar');
    await expect(card.getByRole('button', { name: /Abrir|Continuar/ })).toHaveCount(0);

    const downloadPromise = page.waitForEvent('download');
    await card.getByRole('button', { name: /Descargar original/ }).click();
    const download = await downloadPromise;
    expect(JSON.parse(await readDownloadText(download))).toEqual(DAMAGED_RECORD);

    // El registro sigue intacto tras recargar y tras el autoguardado de la sesión.
    await page.reload();
    expect(await readRawRecord(page)).toEqual(DAMAGED_RECORD);
  });
});
