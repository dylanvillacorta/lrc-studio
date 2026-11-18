import { expect, test } from '@playwright/test';
import {
  isMobileProject,
  loadDemoProject,
  selectSyncMode,
  tapOrPointerDown,
  trackErrors,
} from './helpers/studio';

test.describe('Flujo de sincronización completo', () => {
  test('carga demo, marca líneas con pointerdown/tap, deshace, marca palabras y abre Ráfaga y Karaoke sin errores', async ({
    page,
  }, testInfo) => {
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await loadDemoProject(page);

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
    await page.getByRole('button', { name: 'Deshacer última marca' }).click();
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

    // Abrir Ráfaga y detenerla
    await selectSyncMode(page, 'Ráfaga');
    await expect(page.getByText(/Ráfaga en bucle/i)).toBeVisible();
    await page.getByRole('button', { name: 'Detener ráfaga' }).click();

    // Abrir Karaoke
    await selectSyncMode(page, 'Karaoke');
    await expect(page.getByRole('region', { name: 'Vista previa Karaoke' })).toBeVisible();
    await expect(page.getByText('60 FPS')).toBeVisible();

    assertNoErrors();
  });
});
