import { describe, expect, it } from 'vitest';
import {
  buildStructuredLinesFromText,
  INITIAL_DEMO_LYRICS,
  mergeRawTextWithExistingLines,
  splitLineIntoWords,
  splitRawTextIntoLines,
} from '@/features/lyrics/model/lyricsParser';

describe('lyricsParser', () => {
  it('divide líneas y palabras ignorando espacios múltiples y líneas vacías', () => {
    expect(splitRawTextIntoLines('  Hola mundo \n\n  Adiós  \r\n')).toEqual([
      'Hola mundo',
      'Adiós',
    ]);
    expect(splitLineIntoWords('  Luces   de\tneón  ')).toEqual(['Luces', 'de', 'neón']);
  });

  it('construye líneas sin marcas cuando preloadDemoTimings es false', () => {
    const lines = buildStructuredLinesFromText('Uno dos\nTres');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.startMs).toBeNull();
    expect(lines[0]?.endMs).toBeNull();
    expect(lines[0]?.words.map((w) => w.text)).toEqual(['Uno', 'dos']);
    expect(lines[0]?.words[0]?.startMs).toBeNull();
  });

  it('precarga marcas en milisegundos para INITIAL_DEMO_LYRICS cuando preloadDemoTimings es true', () => {
    const lines = buildStructuredLinesFromText(INITIAL_DEMO_LYRICS, true);
    expect(lines).toHaveLength(6);
    expect(lines[0]?.startMs).toBe(1500);
    expect(lines[0]?.endMs).toBe(4600);
    expect(lines[0]?.words[0]?.startMs).toBe(1500);
    expect(lines[1]?.startMs).toBe(5200);
    expect(lines[2]?.words[0]?.startMs).toBeNull();
    expect(lines[3]?.startMs).toBe(13_000);
    expect(lines[3]?.endMs).toBeNull();
    expect(lines[4]?.startMs).toBeNull();
  });

  it('conserva marcas temporales e IDs al editar la letra mediante mergeRawTextWithExistingLines', () => {
    const original = buildStructuredLinesFromText('Luces de neón\nSegunda línea');
    original[0] = {
      ...original[0]!,
      startMs: 1200,
      endMs: 3800,
      words: [
        { ...original[0]!.words[0]!, startMs: 1200, endMs: 1800 },
        { ...original[0]!.words[1]!, startMs: 1900, endMs: 2200 },
        { ...original[0]!.words[2]!, startMs: 2300, endMs: 3800 },
      ],
    };

    const merged = mergeRawTextWithExistingLines(
      'Luces en neón brillante\nSegunda línea\nTercera nueva',
      original,
    );

    expect(merged).toHaveLength(3);
    expect(merged[0]?.id).toBe(original[0]?.id);
    expect(merged[0]?.startMs).toBe(1200);
    expect(merged[0]?.endMs).toBe(3800);
    expect(merged[0]?.words).toHaveLength(4);
    expect(merged[0]?.words[0]?.startMs).toBe(1200);
    expect(merged[0]?.words[1]?.text).toBe('en');
    expect(merged[0]?.words[1]?.startMs).toBe(1900);
    expect(merged[0]?.words[3]?.text).toBe('brillante');
    expect(merged[0]?.words[3]?.startMs).toBeNull();
    expect(merged[2]?.startMs).toBeNull();
  });

  it('devuelve arreglo vacío si el texto está vacío', () => {
    expect(buildStructuredLinesFromText('   \n  ')).toEqual([]);
    expect(mergeRawTextWithExistingLines('\n  \r\n ', [])).toEqual([]);
  });

  it('conserva marcas independientes por posición cuando hay palabras repetidas y líneas vacías intermedias', () => {
    const existing = buildStructuredLinesFromText('la la la\n\nhoy hoy');
    existing[0] = {
      ...existing[0]!,
      startMs: 1000,
      endMs: 3000,
      words: [
        { id: 'rep-0', text: 'la', startMs: 1000, endMs: 1400 },
        { id: 'rep-1', text: 'la', startMs: 1500, endMs: 2000 },
        { id: 'rep-2', text: 'la', startMs: 2100, endMs: 2900 },
      ],
    };

    const merged = mergeRawTextWithExistingLines('la la la la\n\nhoy hoy', existing);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.words.map((w) => w.id).slice(0, 3)).toEqual([
      'rep-0',
      'rep-1',
      'rep-2',
    ]);
    expect(merged[0]?.words[0]?.startMs).toBe(1000);
    expect(merged[0]?.words[1]?.startMs).toBe(1500);
    expect(merged[0]?.words[2]?.startMs).toBe(2100);
    expect(merged[0]?.words[3]?.startMs).toBeNull();
  });
});
