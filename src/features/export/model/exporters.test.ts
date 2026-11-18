import { describe, expect, it } from 'vitest';
import {
  exportElrc,
  exportJson,
  exportLrc,
  parseProjectJson,
} from '@/features/export/model/exporters';
import {
  buildStructuredLinesFromText,
  INITIAL_DEMO_LYRICS,
} from '@/features/lyrics';
import type { SongMetadata } from '@/types';

const demoMeta: SongMetadata = {
  title: 'Luces de Neón (Demo Synth)',
  artist: 'LyricSync Studio Artist',
  album: 'Midnight Sessions',
  offsetMs: 0,
};

describe('exporters', () => {
  it('exporta LRC con formato idéntico al base para los datos demo', () => {
    const lines = buildStructuredLinesFromText(INITIAL_DEMO_LYRICS, true);
    const lrc = exportLrc(lines, demoMeta);

    const expectedStart = [
      '[ti:Luces de Neón (Demo Synth)]',
      '[ar:LyricSync Studio Artist]',
      '[al:Midnight Sessions]',
      '',
      '[00:01.50] Luces de neón brillan en la ciudad',
      '[00:05.20] Caminamos juntos sin mirar atrás',
      '[00:09.00] Cada latido marca nuestra canción',
      '[00:13.00] El tiempo se detiene en tu voz',
      '[00:00.00] Subimos el volumen hasta el amanecer',
      '[00:00.00] Nada nos detiene hoy aquí',
    ].join('\n');

    expect(lrc).toBe(expectedStart);
  });

  it('exporta ELRC con marcas por palabra y palabras sin sincronizar en texto plano', () => {
    const lines = buildStructuredLinesFromText(INITIAL_DEMO_LYRICS, true).slice(0, 3);
    const elrc = exportElrc(lines, demoMeta);

    const outputLines = elrc.split('\n');
    expect(outputLines[0]).toBe('[ti:Luces de Neón (Demo Synth)]');
    expect(outputLines[3]).toBe('[by:LyricSync Studio Pro]');
    expect(outputLines[5]).toContain('[00:01.50] <00:01.50>Luces');
    expect(outputLines[7]).toBe(
      '[00:09.00] Cada latido marca nuestra canción',
    );
  });

  it('exporta JSON en segundos o ms y lo reimporta fielmente con parseProjectJson', () => {
    const lines = buildStructuredLinesFromText(INITIAL_DEMO_LYRICS, true);
    const jsonSec = exportJson(lines, demoMeta, {
      audioFileName: 'Demo_Synth_120BPM.wav',
      durationMs: 28_000,
      timeUnit: 'seconds',
      exportedAt: '2026-01-01T00:00:00.000Z',
    });

    const parsedSec = parseProjectJson(jsonSec);
    expect(parsedSec.ok).toBe(true);
    if (parsedSec.ok) {
      expect(parsedSec.data.metadata.title).toBe(demoMeta.title);
      expect(parsedSec.data.lines).toHaveLength(6);
      expect(parsedSec.data.lines[0]?.startMs).toBe(1500);
      expect(parsedSec.data.lines[0]?.endMs).toBe(4600);
    }

    const jsonMs = exportJson(lines, demoMeta, { timeUnit: 'ms' });
    const parsedMs = parseProjectJson(jsonMs);
    expect(parsedMs.ok).toBe(true);
    if (parsedMs.ok) {
      expect(parsedMs.data.lines[1]?.startMs).toBe(5200);
    }
  });

  it('devuelve errores en español ante JSON inválido, versión desconocida o estructura incompleta', () => {
    const emptyRes = parseProjectJson('   ');
    expect(emptyRes.ok).toBe(false);

    const syntaxErr = parseProjectJson('{ invalido');
    expect(syntaxErr).toEqual({
      ok: false,
      error: 'El archivo no contiene un JSON válido.',
    });

    const notObj = parseProjectJson('[]');
    expect(notObj).toEqual({
      ok: false,
      error: 'El JSON del proyecto debe ser un objeto.',
    });

    const unknownVersion = parseProjectJson(
      JSON.stringify({ schemaVersion: '99.0-desconocida', lines: [] }),
    );
    expect(unknownVersion.ok).toBe(false);
    if (!unknownVersion.ok) {
      expect(unknownVersion.error).toContain('Versión de proyecto JSON no compatible');
    }

    const noLines = parseProjectJson('{"metadata":{}}');
    expect(noLines).toEqual({
      ok: false,
      error: 'El proyecto JSON no contiene una lista válida de líneas.',
    });

    // JSON mínimo sin schemaVersion sigue siendo compatible con el formato base
    const minimal = parseProjectJson(
      JSON.stringify({ lines: [{ text: 'Hola', startTime: 1.5, endTime: 2.0, words: [] }] }),
    );
    expect(minimal.ok).toBe(true);
    if (minimal.ok) {
      expect(minimal.data.lines[0]?.startMs).toBe(1500);
    }
  });

  it('maneja redondeo a centésimas en LRC/ELRC, palabras repetidas, tiempos iguales y líneas vacías', () => {
    const edgeLines = [
      {
        id: 'l1',
        text: 'hey hey hey',
        startMs: 1239,
        endMs: 1239,
        words: [
          { id: 'w1', text: 'hey', startMs: 1239, endMs: 1400 },
          { id: 'w2', text: 'hey', startMs: 59_999, endMs: 60_000 },
          { id: 'w3', text: 'hey', startMs: 59_999, endMs: 60_500 },
        ],
      },
      {
        id: 'l2',
        text: '',
        startMs: 500,
        endMs: 500,
        words: [],
      },
    ];

    const lrc = exportLrc(edgeLines, { ...demoMeta, offsetMs: -1000 });
    expect(lrc).toContain('[00:00.23] hey hey hey');
    expect(lrc).toContain('[00:00.00] ');

    const elrc = exportElrc(edgeLines, demoMeta);
    expect(elrc).toContain('[00:01.23] <00:01.23>hey <00:59.99>hey <00:59.99>hey');
    expect(elrc).toContain('[00:00.50] ');

    const json = JSON.parse(exportJson(edgeLines, demoMeta, { timeUnit: 'ms' })) as {
      lines: Array<{ duration: number | null }>;
    };
    expect(json.lines[0]?.duration).toBe(0);

    expect(exportLrc([], demoMeta).endsWith('\n')).toBe(true);
  });
});
