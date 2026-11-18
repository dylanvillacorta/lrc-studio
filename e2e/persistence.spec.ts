import { expect, test } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  openCatalog,
  selectSyncMode,
  tapOrPointerDown,
  waitForSaved,
} from './helpers/studio';

test.describe('Persistencia crítica, autoguardado y restauración', () => {
  test('restaura proyecto, pestaña, marcas, audio y onda tras recarga con debounce', async ({
    page,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile);

    // Ir a línea 5 y marcar en 00:05.000
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

    // Cambiar a Palabra y marcar la primera palabra de línea 6 ("Nada")
    await selectSyncMode(page, 'Palabra');
    await tapOrPointerDown(
      page,
      page.getByRole('button', { name: /MARCAR PALABRA/i }),
      isMobile,
    );
    await waitForSaved(page);

    await page.reload();

    // Debe restaurarse en la pestaña Palabra con proyecto y audio
    await expect(
      page
        .getByRole('group', { name: 'Modo de sincronización' })
        .getByRole('button', { name: 'Palabra', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');

    const slider = page.getByRole('slider', { name: 'Posición en la forma de onda' });
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuemax')))
      .toBeGreaterThan(20_000);

    // Verificar reproducción real del audio restaurado
    const playBtn = page.getByRole('button', { name: 'Reproducir' });
    if (await playBtn.isVisible()) {
      await playBtn.click();
      await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
      await page.getByRole('button', { name: 'Pausar' }).click();
    }

    // Volver a Línea y comprobar marca restaurada
    await selectSyncMode(page, 'Línea');
    await expect(
      page.getByRole('button', { name: /Subimos el volumen hasta el amanecer/i }),
    ).toContainText('00:05.00');

    // Verificar porcentajes en Catálogo tras recargar (2/6 líneas sincronizadas)
    await openCatalog(page, isMobile);
    const card = page.getByRole('article', { name: 'Noches de Verano' });
    await expect(card).toContainText('2/6 · 33%');
    await expect(card).toContainText(/Palabras\s*[1-9]\d*%/);
  });

  test('guardado inmediato (flush) con visibilitychange hidden y pagehide sin esperar 300 ms', async ({
    page,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile);
    await waitForSaved(page);

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

    // Disparar inmediatamente visibilitychange hidden y pagehide
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
    });

    await waitForSaved(page);
    await page.reload();

    await expect(
      page.getByRole('button', { name: /Subimos el volumen hasta el amanecer/i }),
    ).toContainText('00:05.00');
  });

  test('cerrar la pestaña y abrir una nueva en el mismo contexto restaura la sesión', async ({
    context,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    const page1 = await context.newPage();
    await page1.goto('/');
    await createProjectWithLyricsAndWav(page1, isMobile);

    const line5 = page1.getByRole('button', {
      name: /Subimos el volumen hasta el amanecer/i,
    });
    await line5.click();
    await page1.getByRole('button', { name: 'Adelantar 5 segundos' }).click();
    await tapOrPointerDown(
      page1,
      page1.getByRole('button', { name: /MARCAR LÍNEA 5/i }),
      isMobile,
    );
    await waitForSaved(page1);
    await page1.close();

    const page2 = await context.newPage();
    await page2.goto('/');
    await expect(
      page2.getByRole('button', { name: /Subimos el volumen hasta el amanecer/i }),
    ).toContainText('00:05.00');
  });
});
