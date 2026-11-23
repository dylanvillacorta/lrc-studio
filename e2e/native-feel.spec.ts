import { expect, test } from '@playwright/test';
import {
  createProjectWithLyricsAndWav,
  isMobileProject,
  openCatalog,
  openExport,
  openLyrics,
  selectSyncMode,
} from './helpers/studio';

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

  test('Ctrl+rueda y Ctrl+(+/-) quedan con defaultPrevented; Ctrl+0 y la rueda normal no', async ({
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
      ctrlZero: false,
      plainMinus: false,
      ctrlZ: false,
    });
  });
});

test.describe('Estabilidad de la página', () => {
  test('sin scroll horizontal en las pantallas principales y overscroll none', async ({
    page,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    const noOverflow = async (label: string) => {
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        bw: document.body.scrollWidth,
      }));
      expect(m.sw, `scrollWidth en ${label}`).toBeLessThanOrEqual(m.cw);
      expect(m.bw, `body.scrollWidth en ${label}`).toBeLessThanOrEqual(m.cw);
    };

    await page.goto('/');
    await noOverflow('catálogo');
    const overscroll = await page.evaluate(() => ({
      body: getComputedStyle(document.body).overscrollBehaviorY,
      html: getComputedStyle(document.documentElement).overscrollBehaviorY,
    }));
    expect(overscroll).toEqual({ body: 'none', html: 'none' });

    await createProjectWithLyricsAndWav(page, isMobile);
    await noOverflow('Línea');
    await selectSyncMode(page, 'Palabra');
    await noOverflow('Palabra');
    await selectSyncMode(page, 'Karaoke');
    await noOverflow('Karaoke');
    await selectSyncMode(page, 'Línea');
    await openLyrics(page, isMobile);
    await noOverflow('Letra');
    await openExport(page, isMobile);
    await noOverflow('Exportar');
    await page.getByRole('button', { name: 'Ajustes de sincronización' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await noOverflow('ajustes');
    await page.keyboard.press('Escape');
    await openCatalog(page, isMobile);
    await noOverflow('catálogo con proyecto');
  });

  test('contextmenu queda prevenido en un botón y no en un textarea', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await openLyrics(page, isMobileProject(testInfo));
    const result = await page.evaluate(() => {
      const fire = (el: Element) => {
        const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
      };
      const button = document.querySelector('button');
      const area = document.querySelector('textarea');
      return {
        button: button ? fire(button) : null,
        textarea: area ? fire(area) : null,
      };
    });
    expect(result).toEqual({ button: true, textarea: false });
  });

  test('el botón de reproducción no cambia de tamaño al alternar play/pausa', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await createProjectWithLyricsAndWav(page, isMobileProject(testInfo));
    const play = page.getByRole('button', { name: 'Reproducir', exact: true }).first();
    const before = await play.boundingBox();
    await play.click();
    const pause = page.getByRole('button', { name: 'Pausar', exact: true }).first();
    await expect(pause).toBeVisible();
    const after = await pause.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after?.width).toBeCloseTo(before?.width ?? 0, 1);
    expect(after?.height).toBeCloseTo(before?.height ?? 0, 1);
    expect(after?.x).toBeCloseTo(before?.x ?? 0, 1);
    expect(after?.y).toBeCloseTo(before?.y ?? 0, 1);
  });
});
