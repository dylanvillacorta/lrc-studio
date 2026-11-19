/**
 * Exportadores e importador/validador de proyectos en LRC, ELRC y JSON.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * `exportedOutput` (línea 1265) y `handleImportJsonProject` (línea 1360).
 *
 * Todas las marcas de entrada en `LyricLine` están en milisegundos.
 */

import { formatLrcTimestamp } from '@/lib/time';
import type { JsonTimeUnit, LyricLine, SongMetadata } from '@/types';
import {
  PROJECT_JSON_SCHEMA_VERSION,
  migrateProjectJson,
  type ParseProjectJsonResult,
  type ParsedProjectJson,
} from './projectMigrations';

export {
  PROJECT_JSON_SCHEMA_VERSION,
  migrateProjectJson,
  type ParseProjectJsonResult,
  type ParsedProjectJson,
};

export interface ExportJsonOptions {
  audioFileName?: string;
  durationMs?: number;
  timeUnit?: JsonTimeUnit;
  exportedAt?: string;
}

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
 * Exporta el proyecto completo a JSON estructurado (`lrc-studio.1`).
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
    schemaVersion: PROJECT_JSON_SCHEMA_VERSION,
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

/**
 * Valida e importa un archivo JSON de proyecto de LyricSync Studio.
 * Delega la normalización de versiones en `migrateProjectJson`.
 * Devuelve las líneas restauradas en milisegundos y metadatos, o un error en español.
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

  return migrateProjectJson(parsed);
}
