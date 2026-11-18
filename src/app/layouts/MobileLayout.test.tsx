import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';

describe('MobileLayout y App', () => {
  it('renderiza el shell móvil con cabecera, navegación inferior y estado vacío inicial', () => {
    const html = renderToString(<App />);

    expect(html).toContain('LyricSync Studio');
    expect(html).toContain('Abrir Mis transcripciones');
    expect(html).toContain('Guardado');
    expect(html).toContain('Catálogo');
    expect(html).toContain('Letra');
    expect(html).toContain('Sincronizar');
    expect(html).toContain('Exportar');
    expect(html).toContain('Subir audio');
    expect(html).not.toContain('Usar demo');
  });
});
