import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DESKTOP_MEDIA_QUERY, useIsDesktop } from '@/lib/useIsDesktop';

function Probe() {
  const isDesktop = useIsDesktop();
  return <span>{isDesktop ? 'desktop' : 'mobile'}</span>;
}

describe('useIsDesktop', () => {
  it('usa (min-width: 768px) como consulta por defecto', () => {
    expect(DESKTOP_MEDIA_QUERY).toBe('(min-width: 768px)');
  });

  it('retorna false de forma segura al renderizar en Node', () => {
    const html = renderToString(<Probe />);
    expect(html).toContain('mobile');
  });
});
