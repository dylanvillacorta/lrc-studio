import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  LyricsScreen,
  countLyricsStats,
  estimateLyricsApplyImpact,
} from '@/features/lyrics';
import type { LyricLine } from '@/types';

const SAMPLE_LINES: LyricLine[] = [
  {
    id: 'l-0',
    text: 'Primera línea',
    startMs: 1000,
    endMs: 3000,
    words: [],
  },
  {
    id: 'l-1',
    text: 'Segunda línea',
    startMs: 3500,
    endMs: 5500,
    words: [],
  },
  {
    id: 'l-2',
    text: 'Tercera línea',
    startMs: null,
    endMs: null,
    words: [],
  },
];

describe('countLyricsStats', () => {
  it('cuenta líneas no vacías y palabras totales', () => {
    expect(countLyricsStats('Hola mundo\n\n  Otra línea más  ')).toEqual({
      lineCount: 2,
      wordCount: 5,
    });
  });

  it('devuelve ceros para texto vacío', () => {
    expect(countLyricsStats('   \n  ')).toEqual({
      lineCount: 0,
      wordCount: 0,
    });
  });
});

describe('estimateLyricsApplyImpact', () => {
  it('calcula marcas conservadas y perdidas al editar la letra', () => {
    const impact = estimateLyricsApplyImpact(
      'Primera línea\nLínea modificada\nTercera línea',
      SAMPLE_LINES,
    );
    expect(impact).toEqual({
      preservedMarks: 1,
      lostMarks: 1,
      totalSyncedMarks: 2,
    });
  });
});

describe('LyricsScreen', () => {
  it('renderiza campos editables, contadores y botones principales', () => {
    const html = renderToString(
      <LyricsScreen
        title="Luces de neón"
        artist="Estudio"
        rawText={'Primera línea\nSegunda línea'}
        existingLines={SAMPLE_LINES}
        onTitleChange={() => {}}
        onArtistChange={() => {}}
        onApply={() => {}}
      />,
    );

    expect(html).toContain('Título de la canción');
    expect(html).toContain('Artista');
    expect(html).toContain('Luces de neón');
    expect(html).toContain('2 líneas · 4 palabras');
    expect(html).toContain('Letra aplicada');
    expect(html).toContain('Cargar letra de ejemplo');
    expect(html).toContain('Aplicar letra');
  });
});
