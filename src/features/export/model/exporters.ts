/**
 * Exportadores e importador/validador de proyectos en LRC, ELRC y JSON.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * `exportedOutput` (línea 1265) y `handleImportJsonProject` (línea 1360).
 *
 * Todas las marcas de entrada en `LyricLine` están en milisegundos.
 */

import { formatLrcTimestamp } from '@/lib/time';
import type { JsonTimeUnit, LyricLine, SongMetadata, WordTiming } from '@/types';

export interface ExportJsonOptions {
  audioFileName?: string;
  durationMs?: number;
  timeUnit?: JsonTimeUnit;
  exportedAt?: string;
}

export interface ParsedProjectJson {
  lines: LyricLine[];
  metadata: Partial<SongMetadata>;
}

export type ParseProjectJsonResult =
  | { ok: true; data: ParsedProjectJson }
  | { ok: false; error: string };

function convertMsToExportUnit(
  ms: number | null,
  offsetMs: number,
  timeUnit: JsonTimeUnit,
): number | null {
  if (ms === null || !Number.isFinite(ms)) {
    return null;
  }
  const adjustedMs = Math.max(0, ms + offsetMs);
  return timeUnit === 'ms'
    ? Math.round(adjustedMs)
    : Number((adjustedMs / 1000).toFixed(3));
}

/**
 * Exporta las líneas sincronizadas al formato estándar LRC por línea.
 * Proviene de la rama `lrc` de `exportedOutput` en el archivo base.
 */
export function exportLrc(
  lines: readonly LyricLine[],
  metadata: SongMetadata,
): string {
  const offsetMs = Number(metadata.offsetMs) || 0;
  const header = [
    `[ti:${metadata.title}]`,
    `[ar:${metadata.artist}]`,
    `[al:${metadata.album}]`,
    '',
  ];

  const body = lines.map((line) => {
    const adjustedMs = Math.max(0, (line.startMs ?? 0) + offsetMs);
    return `[${formatLrcTimestamp(adjustedMs)}] ${line.text}`;
  });

  return [...header, ...body].join('\n');
}

/**
 * Exporta las líneas sincronizadas al formato LRC enriquecido (ELRC) con marcas por palabra.
 * Proviene de la rama `elrc` de `exportedOutput` en el archivo base.
 */
export function exportElrc(
  lines: readonly LyricLine[],
  metadata: SongMetadata,
): string {
  const offsetMs = Number(metadata.offsetMs) || 0;
  const header = [
    `[ti:${metadata.title}]`,
    `[ar:${metadata.artist}]`,
    `[al:${metadata.album}]`,
    '[by:LyricSync Studio Pro]',
    '',
  ];

  const body = lines.map((line) => {
    const adjustedLineMs = Math.max(0, (line.startMs ?? 0) + offsetMs);
    const lineStamp = `[${formatLrcTimestamp(adjustedLineMs)}]`;
    const wordsStr = line.words
      .map((word) => {
        if (word.startMs === null) {
          return word.text;
        }
        const adjustedWordMs = Math.max(0, word.startMs + offsetMs);
        return `<${formatLrcTimestamp(adjustedWordMs)}>${word.text}`;
      })
      .join(' ');
    return `${lineStamp} ${wordsStr}`;
  });

  return [...header, ...body].join('\n');
}

/**
 * Exporta el proyecto completo a JSON estructurado (`2.0-musixmatch-richsync`).
 * Proviene de la rama `json` de `exportedOutput` en el archivo base.
 */
export function exportJson(
  lines: readonly LyricLine[],
  metadata: SongMetadata,
  options: ExportJsonOptions = {},
): string {
  const offsetMs = Number(metadata.offsetMs) || 0;
  const timeUnit: JsonTimeUnit = options.timeUnit ?? 'seconds';
  const durationSeconds = Number(((options.durationMs ?? 0) / 1000).toFixed(3));

  const payload = {
    schemaVersion: '2.0-musixmatch-richsync',
    metadata: {
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      audioFileName: options.audioFileName ?? '',
      durationSeconds,
      timeUnit,
      offsetMs,
      exportedAt: options.exportedAt ?? new Date().toISOString(),
    },
    lines: lines.map((line, idx) => {
      const sTime = convertMsToExportUnit(line.startMs, offsetMs, timeUnit);
      const eTime = convertMsToExportUnit(line.endMs, offsetMs, timeUnit);
      return {
        index: idx,
        id: line.id,
        text: line.text,
        startTime: sTime,
        endTime: eTime,
        duration:
          sTime !== null && eTime !== null
            ? Number((eTime - sTime).toFixed(timeUnit === 'ms' ? 0 : 3))
            : null,
        words: line.words.map((word, wIdx) => ({
          index: wIdx,
          text: word.text,
          startTime: convertMsToExportUnit(word.startMs, offsetMs, timeUnit),
          endTime: convertMsToExportUnit(word.endMs, offsetMs, timeUnit),
        })),
      };
    }),
  };

  return JSON.stringify(payload, null, 2);
}

function toMsOrNull(value: unknown, factorToMs: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value * factorToMs));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Valida e importa un archivo JSON de proyecto de LyricSync Studio.
 * Devuelve las líneas restauradas en milisegundos y metadatos, o un error en español.
 * Proviene de `handleImportJsonProject` en el archivo base.
 */
export function parseProjectJson(rawJson: string): ParseProjectJsonResult {
  if (typeof rawJson !== 'string' || rawJson.trim().length === 0) {
    return { ok: false, error: 'El contenido JSON está vacío.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: 'El archivo no contiene un JSON válido.' };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: 'El JSON del proyecto debe ser un objeto.' };
  }

  if (!Array.isArray(parsed.lines)) {
    return {
      ok: false,
      error: 'El proyecto JSON no contiene una lista válida de líneas.',
    };
  }

  const rawMeta = isRecord(parsed.metadata) ? parsed.metadata : undefined;
  const isMs = rawMeta?.timeUnit === 'ms';
  const factorToMs = isMs ? 1 : 1000;

  const restoredLines: LyricLine[] = [];
  for (let idx = 0; idx < parsed.lines.length; idx++) {
    const rawLine = parsed.lines[idx];
    if (!isRecord(rawLine)) {
      return {
        ok: false,
        error: `La línea #${idx + 1} del proyecto JSON no tiene un formato válido.`,
      };
    }

    const rawWords = Array.isArray(rawLine.words) ? rawLine.words : [];
    const words: WordTiming[] = rawWords.map((rawWord, wIdx) => {
      const wRecord = isRecord(rawWord) ? rawWord : {};
      return {
        id:
          typeof wRecord.id === 'string' && wRecord.id.length > 0
            ? wRecord.id
            : `w-${idx}-${wIdx}`,
        text: typeof wRecord.text === 'string' ? wRecord.text : '',
        startMs: toMsOrNull(wRecord.startTime, factorToMs),
        endMs: toMsOrNull(wRecord.endTime, factorToMs),
      };
    });

    restoredLines.push({
      id:
        typeof rawLine.id === 'string' && rawLine.id.length > 0
          ? rawLine.id
          : `line-${idx}`,
      text: typeof rawLine.text === 'string' ? rawLine.text : '',
      startMs: toMsOrNull(rawLine.startTime, factorToMs),
      endMs: toMsOrNull(rawLine.endTime, factorToMs),
      words,
    });
  }

  const metadata: Partial<SongMetadata> = {};
  if (rawMeta) {
    if (typeof rawMeta.title === 'string') metadata.title = rawMeta.title;
    if (typeof rawMeta.artist === 'string') metadata.artist = rawMeta.artist;
    if (typeof rawMeta.album === 'string') metadata.album = rawMeta.album;
    if (typeof rawMeta.offsetMs === 'number' && Number.isFinite(rawMeta.offsetMs)) {
      metadata.offsetMs = rawMeta.offsetMs;
    }
  }

  return {
    ok: true,
    data: {
      lines: restoredLines,
      metadata,
    },
  };
}
