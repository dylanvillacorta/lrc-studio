import { expect, test } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  selectSyncMode,
  tapOrPointerDown,
  trackErrors,
} from './helpers/studio';

test.describe('Flujo de sincronización completo', () => {
  test('carga demo, marca líneas con pointerdown/tap, deshace, marca palabras y abre Karaoke sin errores', async ({
    page,
  }, testInfo) => {
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Usar demo' })).toHaveCount(0);
    await createProjectWithLyricsAndWav(page, isMobile);

    // Verificar letra de demo cargada (línea 5 sin sincronizar inicialmente)
    const line5Btn = page.getByRole('button', {
      name: /Subimos el volumen hasta el amanecer/i,
    });
    await expect(line5Btn).toBeVisible();
    await expect(line5Btn).toContainText('--:--.--');

    // Seleccionar línea 5 y adelantar 5s para tener una marca clara
    await line5Btn.click();
    await expect(line5Btn).toHaveAttribute('aria-current', 'true');
    await expect(line5Btn).toContainText('--:--.--');
    await page.getByRole('button', { name: 'Adelantar 5 segundos' }).click();

    // Marcar línea 5 con toque real en móvil o pointerdown en escritorio
    const markLineBtn = page.getByRole('button', { name: /MARCAR LÍNEA 5/i });
    await tapOrPointerDown(page, markLineBtn, isMobile);

    await expect(line5Btn).toContainText('00:05.00');
    await expect(page.getByRole('button', { name: /MARCAR LÍNEA 6/i })).toBeVisible();

    // Deshacer revierte la marca
    await page
      .getByRole('button', {
        name: isMobile ? 'Deshacer última marca de línea' : 'Deshacer última marca',
        exact: true,
      })
      .click();
    await expect(line5Btn).toContainText('--:--.--');
    await expect(page.getByRole('button', { name: /MARCAR LÍNEA 5/i })).toBeVisible();

    // Cambiar a modo Palabra
    await selectSyncMode(page, 'Palabra');
    await expect(page.getByText('PALABRA OBJETIVO')).toBeVisible();
    await expect(page.getByRole('status', { name: /Pre-Roll:/i })).toBeVisible();
    await expect(page.getByText(/ESPERA|PREPÁRATE|¡LISTO!/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Repetir Pre-Roll/i })).toBeVisible();

    // Marcar primera palabra ("Subimos") y comprobar avance a "el"
    const markWordBtn = page.getByRole('button', { name: /MARCAR PALABRA/i });
    await expect(markWordBtn).toBeEnabled();
    await tapOrPointerDown(page, markWordBtn, isMobile);

    await expect(page.getByText('PALABRA OBJETIVO')).toBeVisible();
    // La siguiente palabra de "Subimos el volumen..." es "el"
    await expect(page.getByText('el', { exact: true }).first()).toBeVisible();

    // Sin Francotirador, Mantener ni píldoras de navegación de palabra
    await expect(page.getByText('Francotirador')).toHaveCount(0);
    await expect(page.getByText('Mantener', { exact: true })).toHaveCount(0);
    await expect(page.getByText('palabra anterior')).toHaveCount(0);

    // El selector de modo tiene exactamente 3 opciones: Línea, Palabra y Karaoke
    const modeButtons = page
      .getByRole('group', { name: 'Modo de sincronización' })
      .first()
      .getByRole('button');
    await expect(modeButtons).toHaveCount(3);
    await expect(modeButtons).toHaveText(['Línea', 'Palabra', 'Karaoke']);
    await expect(page.getByText('Ráfaga')).toHaveCount(0);

    // Abrir Karaoke
    await selectSyncMode(page, 'Karaoke');
    await expect(page.getByRole('region', { name: 'Vista previa Karaoke' })).toBeVisible();
    await expect(page.getByText('60 FPS')).toBeVisible();

    assertNoErrors();
  });
});
