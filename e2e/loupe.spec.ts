import { expect, test } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  openLoupe,
  tapOrPointerDown,
} from './helpers/studio';

test.describe('Lupa de onda e inspector ±10 / ±50 ms', () => {
  test('arrastrar un borde cambia el tiempo y los botones ±10 y ±50 ajustan exactamente', async ({
    page,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile);

    // Marcar línea 5 en 00:05.000 y seleccionarla
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
    await line5.click();

    await openLoupe(page);
    const loupeRegion = page.getByRole('region', { name: /Ajuste fino de la línea 5/i });

    const startSlider = loupeRegion.getByRole('slider', { name: 'Inicio de la línea' });
    const endSlider = loupeRegion.getByRole('slider', { name: 'Fin de la línea' });

    await expect(startSlider).toHaveAttribute('aria-valuenow', '5000');

    // Ajustar inicio ±50 y ±10 ms exactamente
    await loupeRegion.getByRole('button', { name: 'Ajustar inicio +50 ms' }).click();
    await expect(startSlider).toHaveAttribute('aria-valuenow', '5050');
    await expect(loupeRegion).toContainText('00:05.050');

    await loupeRegion.getByRole('button', { name: 'Ajustar inicio +10 ms' }).click();
    await expect(startSlider).toHaveAttribute('aria-valuenow', '5060');

    await loupeRegion.getByRole('button', { name: 'Ajustar inicio −10 ms' }).click();
    await expect(startSlider).toHaveAttribute('aria-valuenow', '5050');

    await loupeRegion.getByRole('button', { name: 'Ajustar inicio −50 ms' }).click();
    await expect(startSlider).toHaveAttribute('aria-valuenow', '5000');

    // Ajustar fin ±50 y ±10 ms
    const initialEndMs = Number(await endSlider.getAttribute('aria-valuenow'));
    await loupeRegion.getByRole('button', { name: 'Ajustar fin +50 ms' }).click();
    await expect(endSlider).toHaveAttribute('aria-valuenow', String(initialEndMs + 50));
    await loupeRegion.getByRole('button', { name: 'Ajustar fin −10 ms' }).click();
    await expect(endSlider).toHaveAttribute('aria-valuenow', String(initialEndMs + 40));

    // Arrastrar el borde de fin de la línea y comprobar cambio en el tiempo mostrado
    const beforeDragMs = Number(await endSlider.getAttribute('aria-valuenow'));
    const box = await endSlider.boundingBox();
    expect(box).toBeTruthy();
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 40, startY, { steps: 5 });
    await page.mouse.up();

    await expect
      .poll(async () => Number(await endSlider.getAttribute('aria-valuenow')))
      .not.toBe(beforeDragMs);
  });
});
