import { expect, test } from '@playwright/test';
import { isMobileProject, openLyrics } from './helpers/studio';

test.describe('Sensación nativa: sin zoom y sin selección', () => {
  test('meta viewport bloquea el zoom de página', async ({ page }) => {
    await page.goto('/');
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content).toContain('width=device-width');
    expect(content).toContain('initial-scale=1');
    expect(content).toContain('maximum-scale=1');
    expect(content).toContain('user-scalable=no');
  });

  test('doble clic sobre texto no editable no selecciona nada', async ({ page }) => {
    await page.goto('/');
    const text = page
      .locator('h1, h2, h3, p, span')
      .filter({ hasText: /\S{4,}/ })
      .locator('visible=true')
      .first();
    await expect(text).toBeVisible();
    await text.dblclick();
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected).toBe('');
  });

  test('en un textarea se puede seleccionar texto', async ({ page }, testInfo) => {
    await page.goto('/');
    await openLyrics(page, isMobileProject(testInfo));
    const area = page.getByLabel('Letra de la canción, una línea por verso');
    await area.fill('Luces de neon brillan');
    await area.dblclick();
    const selected = await area.evaluate((el: HTMLTextAreaElement) =>
      el.value.slice(el.selectionStart, el.selectionEnd),
    );
    expect(selected.trim().length).toBeGreaterThan(0);
  });

  test('Ctrl+rueda y Ctrl+(+/-/0) quedan con defaultPrevented; la rueda normal no', async ({
    page,
  }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const fire = (ev: Event) => {
        document.body.dispatchEvent(ev);
        return ev.defaultPrevented;
      };
      const wheel = (ctrlKey: boolean) =>
        fire(new WheelEvent('wheel', { ctrlKey, deltaY: -100, bubbles: true, cancelable: true }));
      const key = (k: string, ctrlKey: boolean) =>
        fire(new KeyboardEvent('keydown', { key: k, ctrlKey, bubbles: true, cancelable: true }));
      return {
        ctrlWheel: wheel(true),
        plainWheel: wheel(false),
        ctrlPlus: key('+', true),
        ctrlMinus: key('-', true),
        ctrlZero: key('0', true),
        plainMinus: key('-', false),
        ctrlZ: key('z', true),
      };
    });
    expect(result).toEqual({
      ctrlWheel: true,
      plainWheel: false,
      ctrlPlus: true,
      ctrlMinus: true,
      ctrlZero: true,
      plainMinus: false,
      ctrlZ: false,
    });
  });
});
