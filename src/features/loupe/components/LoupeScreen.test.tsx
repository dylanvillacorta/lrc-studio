import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@/types';
import { InspectorPanel } from './InspectorPanel';
import { LoupeScreen } from './LoupeScreen';

const noop = () => {};

const sampleLines: LyricLine[] = [
  {
    id: 'l6',
    text: 'y el tiempo se detuvo ya',
    startMs: 23_100,
    endMs: 28_500,
    words: [],
  },
  {
    id: 'l7',
    text: 'corazón de sal y fuego',
    startMs: 31_420,
    endMs: 35_870,
    words: [],
  },
];

describe('InspectorPanel y LoupeScreen (SSR)', () => {
  it('InspectorPanel renderiza INICIO, FIN, tiempos en mono y los 4 botones de paso', () => {
    const html = renderToString(
      <InspectorPanel
        startMs={31_420}
        endMs={35_870}
        durationMs={120_000}
        onChange={noop}
      />,
    );

    expect(html).toContain('INICIO');
    expect(html).toContain('FIN');
    expect(html).toContain('00:31.420');
    expect(html).toContain('00:35.870');
    expect(html).toContain('−50');
    expect(html).toContain('−10');
    expect(html).toContain('+10');
    expect(html).toContain('+50');
    expect(html).toContain('aria-label="Ajustar inicio −50 ms"');
    expect(html).toContain('aria-label="Ajustar inicio −10 ms"');
    expect(html).toContain('aria-label="Ajustar inicio +10 ms"');
    expect(html).toContain('aria-label="Ajustar inicio +50 ms"');
    expect(html).toContain('aria-label="Ajustar fin −50 ms"');
    expect(html).toContain('aria-label="Ajustar fin +50 ms"');
    expect(html).toContain('min-h-12');
  });

  it('LoupeScreen renderiza cabecera, vista general, lupa con sliders, inspector y acciones', () => {
    const html = renderToString(
      <LoupeScreen
        peaks={[0.2, 0.5, 0.8, 0.4, 0.6]}
        durationMs={120_000}
        currentTimeMs={32_000}
        line={sampleLines[1]!}
        lineIndex={6}
        lines={sampleLines}
        isSaved
        onChange={noop}
        onPlayLine={noop}
        onApply={noop}
        onBack={noop}
      />,
    );

    expect(html).toContain('Ajuste fino · Línea 7');
    expect(html).toContain('«corazón de sal y fuego»');
    expect(html).toContain('Guardado');
    expect(html).toContain('aria-label="Volver"');
    expect(html).toContain('Vista general');
    expect(html).toContain('zona ampliada ↓');
    expect(html).toContain('LUPA · ARRASTRA LOS BORDES');
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-label="Inicio de la línea"');
    expect(html).toContain('aria-label="Fin de la línea"');
    expect(html).toContain('aria-valuenow="31420"');
    expect(html).toContain('aria-valuenow="35870"');
    expect(html).toContain('Escuchar línea');
    expect(html).not.toContain('Ráfaga')
    expect(html).toContain('Aplicar');
  });
});
