import { expect, test } from '@playwright/test';
import {
  isMobileProject,
  openCatalog,
  openLyrics,
  waitForSaved,
} from './helpers/studio';
import {
  createTinyWavBytes,
  makeFilePayload,
  readDownloadText,
} from './helpers/wav';

test.describe('Catálogo Mis transcripciones', () => {
  test('crea, sube WAV, duplica, exporta respaldo, importa en contexto limpio y elimina sin diálogo nativo', async ({
    browser,
    page,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    let nativeDialogFired = false;
    page.on('dialog', () => {
      nativeDialogFired = true;
    });

    await page.goto('/');
    await openCatalog(page, isMobile);
    const catalogRegion = page.getByRole('region', { name: 'Mis transcripciones' });
    await expect(catalogRegion.getByText('Aún no tienes transcripciones guardadas.')).toBeVisible();

    // Crear nueva transcripción
    await catalogRegion.getByRole('button', { name: 'Nueva transcripción' }).click();
    await expect(page.getByRole('region', { name: 'Sin pista de audio' })).toBeVisible();

    // Subir audio WAV generado en la prueba
    await page
      .locator('input[aria-label="Seleccionar archivo de audio"]')
      .setInputFiles(makeFilePayload('pista-prueba.wav', 'audio/wav', createTinyWavBytes(2)));
    await expect(page.getByRole('button', { name: /MARCAR LÍNEA|SIN LETRA/i })).toBeVisible();

    // Editar título, artista y letra
    await openLyrics(page, isMobile);
    await page.getByLabel('Título de la canción').fill('Canción Catálogo');
    await page.getByLabel('Artista').fill('Banda Test');
    await page.getByLabel('Letra de la canción, una línea por verso').fill('Primer verso\nSegundo verso');
    await page.getByRole('button', { name: 'Aplicar letra' }).click();
    await waitForSaved(page);

    // Ir al catálogo y comprobar tarjeta
    await openCatalog(page, isMobile);
    const originalCard = catalogRegion.getByRole('article', {
      name: 'Canción Catálogo',
      exact: true,
    });
    await expect(originalCard).toBeVisible();
    await expect(originalCard).toContainText('Banda Test');
    await expect(originalCard).toContainText('pista-prueba.wav');

    // Duplicar
    await originalCard.getByRole('button', { name: 'Duplicar' }).click();
    const copyCard = catalogRegion.getByRole('article', {
      name: 'Canción Catálogo (copia)',
      exact: true,
    });
    await expect(copyCard).toBeVisible();

    // Exportar respaldo .json y validar BACKUP_SCHEMA_VERSION
    const downloadPromise = page.waitForEvent('download');
    await originalCard.getByRole('button', { name: 'Exportar respaldo .json' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Canción Catálogo-respaldo.json');
    const backupJsonText = await readDownloadText(download);
    const parsedBackup = JSON.parse(backupJsonText) as {
      schemaVersion: number;
      projects: { title: string }[];
      audios: { fileName: string }[];
    };
    expect(parsedBackup.schemaVersion).toBe(1);
    expect(parsedBackup.projects[0]?.title).toBe('Canción Catálogo');
    expect(parsedBackup.audios).toHaveLength(1);

    // Importar ese respaldo en un contexto limpio y ver la canción
    const cleanContext = await browser.newContext({
      viewport: isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      isMobile,
      hasTouch: isMobile,
    });
    const cleanPage = await cleanContext.newPage();
    await cleanPage.goto('/');
    await openCatalog(cleanPage, isMobile);
    await cleanPage
      .locator('input[aria-label="Seleccionar respaldo .json"]')
      .setInputFiles(makeFilePayload('respaldo.json', 'application/json', backupJsonText));
    await expect(
      cleanPage.getByRole('article', { name: 'Canción Catálogo' }),
    ).toBeVisible();
    await cleanContext.close();

    // Eliminar ambas tarjetas con confirmación accesible (sin dialog nativo)
    for (const title of ['Canción Catálogo (copia)', 'Canción Catálogo']) {
      const card = catalogRegion.getByRole('article', { name: title, exact: true });
      await card.getByRole('button', { name: 'Eliminar' }).click();
      const confirmBox = card.getByRole('alertdialog', {
        name: `Confirmar eliminación de ${title}`,
      });
      await expect(confirmBox).toBeVisible();
      await confirmBox.getByRole('button', { name: 'Sí, eliminar' }).click();
      await expect(card).toHaveCount(0);
    }

    expect(nativeDialogFired).toBe(false);
    await expect(page.getByText('Aún no tienes transcripciones guardadas.')).toBeVisible();
    await expect(page.getByText(/0 canciones/)).toBeVisible();
  });
});
