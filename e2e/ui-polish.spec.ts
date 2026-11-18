import { expect, test } from '@playwright/test';
import { isMobileProject, openLyrics } from './helpers/studio';

test.describe('Pulido de interfaz (T22)', () => {
  test('desactiva selección en botones y la permite en input y textarea de Letra', async ({
    page,
  }, testInfo) => {
    await page.goto('/');

    const infoButton = page.getByRole('button', {
      name: 'Información de la aplicación',
    });
    await expect(infoButton).toBeVisible();

    const buttonUserSelect = await infoButton.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.userSelect || style.webkitUserSelect;
    });
    expect(buttonUserSelect).toBe('none');

    await openLyrics(page, isMobileProject(testInfo));

    const titleInput = page.getByLabel('Título de la canción');
    const textarea = page.getByLabel('Letra de la canción, una línea por verso');

    const inputUserSelect = await titleInput.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.userSelect || style.webkitUserSelect;
    });
    const textareaUserSelect = await textarea.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.userSelect || style.webkitUserSelect;
    });

    expect(inputUserSelect).toBe('text');
    expect(textareaUserSelect).toBe('text');
  });

  test('Letra arranca vacía por defecto y sin botón de cargar ejemplo', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await openLyrics(page, isMobileProject(testInfo));

    await expect(
      page.getByRole('button', { name: 'Cargar letra de ejemplo' }),
    ).toHaveCount(0);

    const textarea = page.getByLabel('Letra de la canción, una línea por verso');
    await expect(textarea).toHaveValue('');
    await expect(textarea).toHaveAttribute(
      'placeholder',
      /Escribe o pega la letra aquí/,
    );
  });

  test('oculta el pie de versión y abre el diálogo Info con versión, commit y cierre con Escape', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator('footer')).toHaveCount(0);

    await page
      .getByRole('button', { name: 'Información de la aplicación' })
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('LyricSync Studio');
    await expect(dialog).toContainText(/v\d+\.\d+\.\d+/);
    await expect(dialog).toContainText('Commit');
    await expect(
      dialog.getByRole('button', { name: 'Buscar actualizaciones' }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
