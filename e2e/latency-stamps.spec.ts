import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  tapOrPointerDown,
  trackErrors,
  waitForSaved,
} from './helpers/studio';

declare global {
  interface Window {
    __lrcAudioElement?: HTMLAudioElement | null;
  }
}

const AUDIO_SECONDS = 95;

function sliderOf(page: Page) {
  return page.getByRole('slider', { name: 'Posición en la forma de onda' });
}

async function displayedMs(page: Page): Promise<number> {
  return Number(await sliderOf(page).getAttribute('aria-valuenow'));
}

async function audioMs(page: Page): Promise<number> {
  return page.evaluate(() => (window.__lrcAudioElement?.currentTime ?? -1) * 1000);
}

async function seekToFraction(page: Page, isMobile: boolean, fraction: number) {
  const slider = sliderOf(page);
  const box = await slider.boundingBox();
  expect(box).toBeTruthy();
  const pointerType = isMobile ? 'touch' : 'mouse';
  const y = box!.y + box!.height / 2;
  await slider.dispatchEvent('pointerdown', {
    pointerId: 9,
    pointerType,
    clientX: box!.x + box!.width * 0.2,
    clientY: y,
    isPrimary: true,
  });
  const expanded = (await slider.boundingBox())!;
  const x = expanded.x + expanded.width * fraction;
  const ey = expanded.y + expanded.height / 2;
  await slider.dispatchEvent('pointermove', {
    pointerId: 9,
    pointerType,
    clientX: x,
    clientY: ey,
    isPrimary: true,
  });
  await slider.dispatchEvent('pointerup', {
    pointerId: 9,
    pointerType,
    clientX: x,
    clientY: ey,
    isPrimary: true,
  });
}

test.describe('Marcas exactas, calibración de latencia y desplazar marcas (T24)', () => {
  test('marcar en tiempo conocido, seek al seleccionar línea, latencia 200 ms y desplazar -200 ms', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const assertNoErrors = trackErrors(page);
    const isMobile = isMobileProject(testInfo);

    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobile, AUDIO_SECONDS);

    // 1. Con latencia 0: mover la barra en pausa a un tiempo conocido y marcar la línea 1.
    await seekToFraction(page, isMobile, 0.3);
    await expect.poll(async () => audioMs(page)).toBeGreaterThan(20_000);
    await expect
      .poll(async () => Math.abs((await displayedMs(page)) - (await audioMs(page))))
      .toBeLessThan(50);
    const knownTime1Ms = Math.round(await audioMs(page));

    await tapOrPointerDown(
      page,
      page.getByRole('button', { name: /MARCAR LÍNEA 1/i }),
      isMobile,
    );
    await expect(page.getByRole('button', { name: /MARCAR LÍNEA 2/i })).toBeVisible();

    // Mover la barra lejos y seleccionar la línea 1: no hace seek; «Reproducir desde aquí» sí salta a la marca.
    await seekToFraction(page, isMobile, 0.75);
    await expect.poll(async () => audioMs(page)).toBeGreaterThan(55_000);

    const line1Button = page.locator('button', {
      hasText: 'Luces de neón brillan en la ciudad',
    });
    await line1Button.click();
    await expect(line1Button).toHaveAttribute('aria-current', 'true');
    await expect.poll(async () => audioMs(page)).toBeGreaterThan(55_000);

    await page.getByRole('button', { name: 'Reproducir desde aquí' }).click();
    await expect
      .poll(async () => await audioMs(page))
      .toBeGreaterThanOrEqual(knownTime1Ms - 50);
    await expect
      .poll(async () => await audioMs(page))
      .toBeLessThan(knownTime1Ms + 1500);
    await page.getByRole('button', { name: 'Pausar' }).click();

    // 2. Configurar latencyMs = 200 y marcar la línea 2 en otro tiempo conocido.
    await page.getByRole('button', { name: 'Ajustes de sincronización' }).click();
    const latencyInput = page.getByRole('spinbutton', {
      name: 'Latencia en milisegundos',
    });
    await latencyInput.fill('200');
    await page
      .getByRole('button', { name: 'Cerrar ajustes de sincronización' })
      .click();

    // Volver a seleccionar la línea 2 para marcarla.
    const line2Button = page.locator('button', {
      hasText: 'Caminamos juntos sin mirar atrás',
    });
    await line2Button.click();
    await expect(page.getByRole('button', { name: /MARCAR LÍNEA 2/i })).toBeVisible();

    await seekToFraction(page, isMobile, 0.5);
    await expect.poll(async () => audioMs(page)).toBeGreaterThan(40_000);
    await expect
      .poll(async () => Math.abs((await displayedMs(page)) - (await audioMs(page))))
      .toBeLessThan(50);
    const knownTime2Ms = Math.round(await audioMs(page));

    await tapOrPointerDown(
      page,
      page.getByRole('button', { name: /MARCAR LÍNEA 2/i }),
      isMobile,
    );
    await expect(page.getByRole('button', { name: /MARCAR LÍNEA 3/i })).toBeVisible();

    // Alejar y seleccionar la línea 2: debe caer 200 ms antes de knownTime2Ms.
    await seekToFraction(page, isMobile, 0.1);
    await expect.poll(async () => audioMs(page)).toBeLessThan(15_000);
    await line2Button.click();

    await expect
      .poll(async () => Math.abs((await audioMs(page)) - (knownTime2Ms - 200)))
      .toBeLessThan(50);
    await expect(line2Button).toHaveAttribute('aria-current', 'true');

    // 3. Desplazar todas las marcas en -200 ms y verificar que el seek cae en la marca nueva.
    await page.getByRole('button', { name: 'Ajustes de sincronización' }).click();
    await page
      .getByRole('spinbutton', { name: 'Desplazar marcas en milisegundos' })
      .fill('-200');
    await page.getByRole('button', { name: 'Aplicar a todas las marcas' }).click();
    await page
      .getByRole('button', { name: 'Cerrar ajustes de sincronización' })
      .click();
    await waitForSaved(page);

    await seekToFraction(page, isMobile, 0.85);
    await expect.poll(async () => audioMs(page)).toBeGreaterThan(70_000);
    await line2Button.click();

    await expect
      .poll(async () => Math.abs((await audioMs(page)) - (knownTime2Ms - 400)))
      .toBeLessThan(50);
    await expect(line2Button).toHaveAttribute('aria-current', 'true');

    assertNoErrors();
  });
});
