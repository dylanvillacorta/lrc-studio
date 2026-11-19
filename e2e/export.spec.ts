import { expect, test } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  openExport,
  openLyrics,
  openSyncEditor,
  selectSyncMode,
  tapOrPointerDown,
} from './helpers/studio';
import { makeFilePayload } from './helpers/wav';

test.describe('Exportación LRC, ELRC, JSON e importación', () => {
  test('previsualiza LRC/ELRC/JSON, copia, descarga con nombre saneado y valida JSON inválido en español', async ({
    context,
    page,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile);

    // Usar caracteres inválidos de archivo para verificar saneamiento al descargar
    await openLyrics(page, isMobile);
    await page.getByLabel('Título de la canción').fill('Canción: /Prueba*');
    await page.getByLabel('Artista').fill('Luna / Alba');
    await openSyncEditor(page, isMobile);

    // Marcar línea 5 en 00:05.000 y una palabra
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

    await selectSyncMode(page, 'Palabra');
    await tapOrPointerDown(
      page,
      page.getByRole('button', { name: /MARCAR PALABRA/i }),
      isMobile,
    );

    await openExport(page, isMobile);
    const exportRegion = page.getByRole('region', {
      name: 'Exportar e importar proyecto',
    });

    // Vista previa LRC
    const preview = exportRegion.locator('pre');
    await expect(preview).toContainText('[ti:Canción: /Prueba*]');
    await expect(preview).toContainText('[ar:Luna / Alba]');
    await expect(preview).toContainText('[00:05.00] Subimos el volumen hasta el amanecer');

    // Copiar confirma en español
    await exportRegion.getByRole('button', { name: 'Copiar' }).click();
    await expect(
      exportRegion.getByText('Contenido LRC copiado al portapapeles.'),
    ).toBeVisible();

    // Descargar dispara archivo con nombre saneado
    const downloadPromise = page.waitForEvent('download');
    await exportRegion.getByRole('button', { name: 'Descargar .lrc' }).click();
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    expect(filename.endsWith('.lrc')).toBe(true);
    expect(filename).not.toMatch(/[\\/:*?"<>|]/);

    // Vista previa ELRC
    await exportRegion
      .getByRole('group', { name: 'Formato de exportación' })
      .getByRole('button', { name: 'ELRC', exact: true })
      .click();
    await expect(preview).toContainText('[by:LyricSync Studio Pro]');
    await expect(preview).toContainText(/<00:\d{2}\.\d{2}>Nada/);

    // Vista previa JSON
    await exportRegion
      .getByRole('group', { name: 'Formato de exportación' })
      .getByRole('button', { name: 'JSON', exact: true })
      .click();
    const jsonText = (await preview.textContent()) ?? '{}';
    const parsed = JSON.parse(jsonText) as {
      schemaVersion: string;
      lines: { startTime: number | null }[];
    };
    expect(parsed.schemaVersion).toBe('lrc-studio.1');
    expect(parsed.lines[4]?.startTime).toBe(5);

    // Importar JSON inválido muestra error en español
    const fileInput = exportRegion.locator(
      'input[aria-label="Seleccionar archivo JSON de proyecto"]',
    );
    await fileInput.setInputFiles(
      makeFilePayload('roto.json', 'application/json', '{ json invalido'),
    );
    await expect(exportRegion.getByRole('alert')).toHaveText(
      'El archivo no contiene un JSON válido.',
    );

    await fileInput.setInputFiles(
      makeFilePayload(
        'sin-lineas.json',
        'application/json',
        JSON.stringify({ schemaVersion: 'lrc-studio.1' }),
      ),
    );
    await expect(exportRegion.getByRole('alert')).toHaveText(
      'El proyecto JSON no contiene una lista válida de líneas.',
    );
  });
});
