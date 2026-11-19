import { expect, test } from '@playwright/test';

test('muestra el título principal LRC Studio', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'LRC Studio' })).toBeVisible();
});
