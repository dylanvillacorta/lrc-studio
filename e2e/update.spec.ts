import { expect, test } from '@playwright/test';
import {
  isMobileProject,
  loadDemoProject,
  tapOrPointerDown,
} from './helpers/studio';

test.describe('Actualización de versión en caliente', () => {
  test('detecta nueva versión, muestra aviso y hace flush antes de recargar conservando el trabajo', async ({
    page,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    let serveNewVersion = true;

    await page.route('**/version.json*', async (route) => {
      if (serveNewVersion) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            version: '99.0.0',
            commit: 'newrev1',
            builtAt: '2026-11-18T12:00:00.000Z',
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/');
    await expect(page.getByText('Nueva versión disponible · Actualizar')).toBeVisible();

    await loadDemoProject(page);

    // Marcar línea 5 en 00:05.000 y pulsar Actualizar de inmediato sin esperar 300 ms
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
    await expect(line5).toContainText('00:05.00');

    serveNewVersion = false;
    await Promise.all([
      page.waitForNavigation(),
      page.getByRole('button', { name: 'Actualizar' }).click(),
    ]);

    // La página recargó y el trabajo pendiente fue guardado por flush()
    await expect(
      page.getByRole('button', { name: /Subimos el volumen hasta el amanecer/i }),
    ).toContainText('00:05.00');
  });
});
