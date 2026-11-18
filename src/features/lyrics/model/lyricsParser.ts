/**
 * Parseo, estructuración y fusión de letras en líneas y palabras.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * `INITIAL_DEMO_LYRICS` (línea 141), `buildStructuredLinesFromText` (línea 148)
 * y `mergeRawTextWithExistingLines` (línea 200).
 *
 * Todas las marcas temporales (`startMs`, `endMs`) se expresan en milisegundos
 * conforme a los contratos `LyricLine` y `WordTiming` de `src/types/index.ts`.
 */

import type { LyricLine, WordTiming } from '@/types';

/**
 * Letra de demostración inicial con las primeras líneas pre-sincronizadas.
 * Proviene de `INITIAL_DEMO_LYRICS` en el archivo base.
 */
export const INITIAL_DEMO_LYRICS = `Luces de neón brillan en la ciudad
Caminamos juntos sin mirar atrás
Cada latido marca nuestra canción
El tiempo se detiene en tu voz
Subimos el volumen hasta el amanecer
Nada nos detiene hoy aquí`;

interface DemoPresetTiming {
  startMs: number | null;
  endMs: number | null;
}

const DEMO_TIMINGS_MS: readonly DemoPresetTiming[] = [
  { startMs: 1500, endMs: 4600 },
  { startMs: 5200, endMs: 8400 },
  { startMs: 9000, endMs: 12_200 },
  { startMs: 13_000, endMs: null },
  { startMs: null, endMs: null },
  { startMs: null, endMs: null },
];

function createTokenId(prefix: string, lineIdx: number, wordIdx?: number): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return wordIdx === undefined
    ? `${prefix}-${lineIdx}-${rand}`
    : `${prefix}-${lineIdx}-${wordIdx}-${rand}`;
}

/**
 * Divide una línea de letra en palabras individuales eliminando espacios sobrantes.
 */
export function splitLineIntoWords(lineText: string): string[] {
  return lineText.split(/\s+/).filter(Boolean);
}

/**
 * Divide un texto completo de letra en líneas no vacías recortadas.
 */
export function splitRawTextIntoLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Construye líneas estructuradas (`LyricLine[]`) a partir de texto plano.
 * Si `preloadDemoTimings` es `true`, precarga marcas en milisegundos para la letra demo.
 * Proviene de `buildStructuredLinesFromText` en el archivo base (convertido de segundos a ms).
 */
export function buildStructuredLinesFromText(
  rawText: string,
  preloadDemoTimings = false,
): LyricLine[] {
  const rawLines = splitRawTextIntoLines(rawText);

  return rawLines.map((lineText, lIdx) => {
    const tokens = splitLineIntoWords(lineText);
    const preset = preloadDemoTimings ? DEMO_TIMINGS_MS[lIdx] : undefined;
    const hasFullLine =
      preset !== undefined && preset.startMs !== null && preset.endMs !== null;
    const wordDurMs =
      hasFullLine && tokens.length > 0
        ? (preset.endMs! - preset.startMs!) / tokens.length
        : 0;

    const words: WordTiming[] = tokens.map((wordText, wIdx) => {
      const cleanWord = wordText.trim() || `Palabra_${wIdx + 1}`;
      if (hasFullLine && lIdx < 2 && preset.startMs !== null) {
        const wStartMs = Math.round(preset.startMs + wIdx * wordDurMs);
        const wEndMs = Math.round(wStartMs + wordDurMs - 40);
        return {
          id: createTokenId('w', lIdx, wIdx),
          text: cleanWord,
          startMs: wStartMs,
          endMs: wEndMs,
        };
      }
      return {
        id: createTokenId('w', lIdx, wIdx),
        text: cleanWord,
        startMs: null,
        endMs: null,
      };
    });

    return {
      id: createTokenId('line', lIdx),
      text: lineText,
      startMs: preset ? preset.startMs : null,
      endMs: preset ? preset.endMs : null,
      words,
    };
  });
}

/**
 * Combina cambios en el texto en bruto preservando las marcas temporales existentes
 * (en milisegundos) e identificadores de líneas y palabras por posición.
 * Proviene de `mergeRawTextWithExistingLines` en el archivo base.
 */
export function mergeRawTextWithExistingLines(
  rawText: string,
  existingLines: readonly LyricLine[] = [],
): LyricLine[] {
  const rawLines = splitRawTextIntoLines(rawText);

  return rawLines.map((lineText, lIdx) => {
    const prevLine = existingLines[lIdx];
    const tokens = splitLineIntoWords(lineText);

    const words: WordTiming[] = tokens.map((wordText, wIdx) => {
      const cleanWord = wordText.trim() || `Palabra_${wIdx + 1}`;
      const prevWord = prevLine?.words[wIdx];
      return {
        id: prevWord?.id ?? createTokenId('w', lIdx, wIdx),
        text: cleanWord,
        startMs: prevWord?.startMs ?? null,
        endMs: prevWord?.endMs ?? null,
      };
    });

    return {
      id: prevLine?.id ?? createTokenId('line', lIdx),
      text: lineText,
      startMs: prevLine?.startMs ?? null,
      endMs: prevLine?.endMs ?? null,
      words,
    };
  });
}
