import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  InfoDialog,
  formatBuildDate,
  resolveAppDomain,
} from '@/features/version';

describe('InfoDialog', () => {
  it('no renderiza nada cuando open es false', () => {
    const html = renderToString(
      <InfoDialog
        open={false}
        onClose={() => {}}
        updateAvailable={false}
        onCheckUpdates={() => {}}
        onApplyUpdate={() => {}}
      />,
    );
    expect(html).toBe('');
  });

  it('renderiza nombre, versión, commit, compilación, dominio y controles accesibles', () => {
    const html = renderToString(
      <InfoDialog
        open
        onClose={() => {}}
        version="1.2.3"
        commit="abc1234"
        builtAt="2026-11-18T12:00:00.000Z"
        domain="lrc.dirtykeras.com"
        updateAvailable={false}
        onCheckUpdates={() => {}}
        onApplyUpdate={() => {}}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('LyricSync Studio');
    expect(html).toContain('v1.2.3');
    expect(html).toContain('abc1234');
    expect(html).toContain('lrc.dirtykeras.com');
    expect(html).toContain('Buscar actualizaciones');
    expect(html).toContain('aria-label="Cerrar información"');
    expect(html).toContain('min-h-[44px]');
  });

  it('formatBuildDate y resolveAppDomain manejan valores ausentes con respaldo seguro', () => {
    expect(formatBuildDate(null)).toBe('Compilación local');
    expect(formatBuildDate('invalid-date')).toBe('invalid-date');
    expect(resolveAppDomain('ejemplo.local')).toBe('ejemplo.local');
    expect(resolveAppDomain()).toBe('lrc.dirtykeras.com');
  });
});
