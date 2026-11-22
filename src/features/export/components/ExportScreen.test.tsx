import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExportScreen } from '@/features/export';
import type { ProjectFullData } from '@/types';

const SAMPLE_PROJECT: ProjectFullData = {
  id: 'proj-1',
  title: 'Luces de neón',
  artist: 'Estudio Nocturno',
  audioFileName: 'luces.wav',
  durationMs: 120_000,
  totalLines: 2,
  syncedLines: 1,
  totalWords: 4,
  syncedWords: 2,
  lineProgress: 50,
  wordProgress: 50,
  updatedAt: 1_700_000_000_000,
  createdAt: 1_700_000_000_000,
  waveformPeaks: [0.1, 0.5],
  settings: {
    playbackRate: 1,
    preRollSeconds: 3,
    autoAdvance: true,
  },
  lines: [
    {
      id: 'l-0',
      text: 'Luces de neón',
      startMs: 1500,
      endMs: 4000,
      words: [],
    },
    {
      id: 'l-1',
      text: 'En la ciudad',
      startMs: null,
      endMs: null,
      words: [],
    },
  ],
};

describe('ExportScreen', () => {
  it('renderiza selector de formato, resumen, botones y región aria-live', () => {
    const html = renderToString(
      <ExportScreen project={SAMPLE_PROJECT} onImport={() => {}} />,
    );

    expect(html).toContain('LRC');
    expect(html).toContain('ELRC');
    expect(html).toContain('JSON');
    expect(html).toContain('1 de 2 líneas sincronizadas');
    expect(html).toContain('2 de 4 palabras');
    expect(html).toContain('Faltan marcas de tiempo en algunas líneas');
    expect(html).toContain('Copiar');
    expect(html).toContain('Descargar .lrc');
    expect(html).toContain('Importar proyecto JSON');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('[ti:Luces de neón]');
  });
});
