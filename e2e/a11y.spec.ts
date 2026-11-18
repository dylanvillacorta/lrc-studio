import { expect, test, type Page } from '@playwright/test';
import {
  isMobileProject,
  loadDemoProject,
  openCatalog,
  openExport,
  openLyrics,
  openSyncEditor,
  selectSyncMode,
} from './helpers/studio';

async function auditButtons(page: Page, checkTouchTargets: boolean): Promise<void> {
  const issues = await page.evaluate((mustCheckSize) => {
    const problems: string[] = [];
    const buttons = Array.from(document.querySelectorAll('button'));

    for (const btn of buttons) {
      const style = window.getComputedStyle(btn);
      const rect = btn.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
        continue;
      }

      const ariaLabel = btn.getAttribute('aria-label')?.trim() ?? '';
      const ariaLabelledBy = btn.getAttribute('aria-labelledby')?.trim() ?? '';
      const text = (btn.innerText || btn.textContent || '').trim();
      const title = btn.getAttribute('title')?.trim() ?? '';
      if (!ariaLabel && !ariaLabelledBy && !text && !title) {
        problems.push(`Botón sin nombre accesible: ${btn.outerHTML.slice(0, 100)}`);
      }

      if (mustCheckSize && (rect.width < 44 || rect.height < 44)) {
        problems.push(
          `Objetivo táctil < 44 px (${Math.round(rect.width)}x${Math.round(rect.height)}): "${ariaLabel || text}"`,
        );
      }
    }

    return problems;
  }, checkTouchTargets);

  expect(issues, issues.join('\n')).toEqual([]);
}

test.describe('Accesibilidad básica', () => {
  test('todos los botones tienen nombre accesible, >=44px en móvil y foco visible en escritorio', async ({
    page,
  }, testInfo) => {
    const isMobile = isMobileProject(testInfo);
    await page.goto('/');
    await loadDemoProject(page);

    // Auditar modo Línea, Palabra, Letra, Exportar y Catálogo
    await auditButtons(page, isMobile);

    await selectSyncMode(page, 'Palabra');
    await auditButtons(page, isMobile);

    await openLyrics(page, isMobile);
    await auditButtons(page, isMobile);

    await openExport(page, isMobile);
    await auditButtons(page, isMobile);

    await openSyncEditor(page, isMobile);
    await openCatalog(page, isMobile);
    await auditButtons(page, isMobile);

    // Foco visible al tabular en escritorio
    if (!isMobile) {
      await page.getByRole('button', { name: 'Cerrar catálogo' }).click();
      let foundVisibleFocus = false;
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        const focusInfo = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const style = window.getComputedStyle(el);
          return {
            tag: el.tagName,
            boxShadow: style.boxShadow,
            outlineStyle: style.outlineStyle,
          };
        });
        if (
          focusInfo &&
          (focusInfo.boxShadow !== 'none' || focusInfo.outlineStyle !== 'none')
        ) {
          foundVisibleFocus = true;
          break;
        }
      }
      expect(foundVisibleFocus).toBe(true);
    }
  });
});
