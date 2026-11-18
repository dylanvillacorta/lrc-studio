import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export function isMobileProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'mobile';
}

export function trackErrors(page: Page): () => void {
  const errors: string[] = [];

  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console.error: ${msg.text()}`);
    }
  });

  return () => {
    expect(errors, `Errores inesperados en consola:\n${errors.join('\n')}`).toEqual([]);
  };
}

export async function loadDemoProject(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Usar demo' }).click();
  await expect(page.getByRole('button', { name: /MARCAR LÍNEA/i })).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Posición en la forma de onda' });
  await expect
    .poll(async () => Number(await slider.getAttribute('aria-valuemax')))
    .toBeGreaterThan(20_000);
}

export async function tapOrPointerDown(
  page: Page,
  locator: Locator,
  isMobile: boolean,
): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  if (isMobile) {
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error('El botón objetivo no tiene dimensiones visibles para tap.');
    }
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    return;
  }
  await locator.dispatchEvent('pointerdown');
}

export async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
}

export async function selectSyncMode(
  page: Page,
  modeLabel: 'Línea' | 'Palabra' | 'Ráfaga' | 'Karaoke',
): Promise<void> {
  await page
    .getByRole('group', { name: 'Modo de sincronización' })
    .getByRole('button', { name: modeLabel, exact: true })
    .click();
}

export async function openCatalog(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page.getByRole('button', { name: 'Abrir Mis transcripciones' }).click();
  } else {
    await page.getByRole('button', { name: 'Gestionar catálogo completo' }).click();
  }
  await expect(page.getByRole('region', { name: 'Mis transcripciones' })).toBeVisible();
}

export async function openLyrics(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('button', { name: 'Letra' })
      .click();
  } else {
    await page.getByRole('button', { name: 'Letra', exact: true }).click();
  }
  await expect(page.getByRole('region', { name: 'Editor de letra' })).toBeVisible();
}

export async function openExport(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('button', { name: 'Exportar' })
      .click();
  } else {
    await page.getByRole('button', { name: /Exportar LRC \/ ELRC \/ JSON/i }).click();
  }
  await expect(
    page.getByRole('region', { name: 'Exportar e importar proyecto' }),
  ).toBeVisible();
}

export async function openSyncEditor(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('button', { name: 'Sincronizar' })
      .click();
  } else {
    const lyricsBtn = page.getByRole('button', { name: 'Letra', exact: true });
    if ((await lyricsBtn.getAttribute('aria-pressed')) === 'true') {
      await lyricsBtn.click();
      return;
    }
    const exportBtn = page.getByRole('button', { name: /Exportar LRC \/ ELRC \/ JSON/i });
    if ((await exportBtn.getAttribute('aria-pressed')) === 'true') {
      await exportBtn.click();
    }
  }
}

export async function openLoupe(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Abrir ajuste fino en lupa' }).click();
  await expect(
    page.getByRole('region', { name: /Ajuste fino de la línea/i }),
  ).toBeVisible();
}
