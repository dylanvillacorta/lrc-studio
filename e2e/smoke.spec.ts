import { expect, test } from '@playwright/test';

test('muestra el título principal LyricSync Studio', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'LyricSync Studio' })).toBeVisible();
});
