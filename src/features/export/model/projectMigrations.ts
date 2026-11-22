import {
  formatUnknownSchemaError,
  runMigrations,
  type MigrationStep,
} from '@/lib/schemaMigration';
import type { LyricLine, SongMetadata, WordTiming } from '@/types';

/**
 * Versión de esquema usada al exportar e importar proyectos JSON individuales.
 */
export const PROJECT_JSON_SCHEMA_VERSION = 'lrc-studio.1' as const;

/**
 * Versiones de esquema reconocidas por el migrador, ordenadas de la más antigua a la actual.
 */
export const KNOWN_PROJECT_SCHEMA_VERSIONS = [
  '1.0',
  '2.0',
  '2.0-musixmatch-richsync',
  PROJECT_JSON_SCHEMA_VERSION,
] as const;

export type KnownProjectSchemaVersion =
  (typeof KNOWN_PROJECT_SCHEMA_VERSIONS)[number];

export interface ParsedProjectJson {
  lines: LyricLine[];
  metadata: Partial<SongMetadata>;
  audioFileName?: string;
}

export type ParseProjectJsonResult =
  | { ok: true; data: ParsedProjectJson }
  | { ok: false; error: string };

type ProjectMigrationStep = MigrationStep<
  KnownProjectSchemaVersion,
  Record<string, unknown>
>;

/**
 * Tabla de pasos de migración secuencial entre versiones conocidas del esquema JSON.
 * Cada entrada transforma un documento de su versión origen a la siguiente versión.
 * Los pasos nunca se borran ni se reescriben.
 */
export const PROJECT_MIGRATION_STEPS: Partial<
  Record<KnownProjectSchemaVersion, ProjectMigrationStep>
> = {
  '1.0': {
    nextVersion: '2.0',
    migrate: (doc) => ({
      ...doc,
      schemaVersion: '2.0',
    }),
  },
  '2.0': {
    nextVersion: '2.0-musixmatch-richsync',
    migrate: (doc) => ({
      ...doc,
      schemaVersion: '2.0-musixmatch-richsync',
    }),
  },
  '2.0-musixmatch-richsync': {
    nextVersion: PROJECT_JSON_SCHEMA_VERSION,
    migrate: (doc) => ({
      ...doc,
      schemaVersion: PROJECT_JSON_SCHEMA_VERSION,
    }),
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toMsOrNull(value: unknown, factorToMs: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value * factorToMs));
}

function resolveSchemaVersion(rawVersion: unknown): KnownProjectSchemaVersion | null {
  if (rawVersion === undefined || rawVersion === null) {
    return '1.0';
  }
  if (rawVersion === 1 || rawVersion === '1' || rawVersion === '1.0') {
    return '1.0';
  }
  if (rawVersion === 2 || rawVersion === '2' || rawVersion === '2.0') {
    return '2.0';
  }
  if (rawVersion === '2.0-musixmatch-richsync') {
    return '2.0-musixmatch-richsync';
  }
  if (rawVersion === PROJECT_JSON_SCHEMA_VERSION) {
    return PROJECT_JSON_SCHEMA_VERSION;
  }
  return null;
}

function mapMigratedLines(
  rawLines: unknown[],
  factorToMs: number,
): { ok: true; lines: LyricLine[] } | { ok: false; error: string } {
  const restoredLines: LyricLine[] = [];

  for (let idx = 0; idx < rawLines.length; idx++) {
    const rawLine = rawLines[idx];
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

  return { ok: true, lines: restoredLines };
}

/**
 * Migra un objeto JSON de proyecto ya parseado desde cualquier versión de esquema conocida
 * hacia el formato actual (`ParsedProjectJson`) con tiempos normalizados en milisegundos.
 */
export function migrateProjectJson(parsed: unknown): ParseProjectJsonResult {
  if (!isRecord(parsed)) {
    return { ok: false, error: 'El JSON del proyecto debe ser un objeto.' };
  }

  const resolvedVersion = resolveSchemaVersion(parsed.schemaVersion);
  if (!resolvedVersion) {
    return { ok: false, error: formatUnknownSchemaError(parsed.schemaVersion) };
  }

  let migrated: ReturnType<typeof runMigrations<KnownProjectSchemaVersion, Record<string, unknown>>>;
  try {
    migrated = runMigrations<KnownProjectSchemaVersion, Record<string, unknown>>({
      steps: PROJECT_MIGRATION_STEPS,
      knownVersions: KNOWN_PROJECT_SCHEMA_VERSIONS,
      currentVersion: PROJECT_JSON_SCHEMA_VERSION,
      fromVersion: resolvedVersion,
      doc: parsed,
    });
  } catch {
    return { ok: false, error: 'Falló un paso de migración del proyecto JSON.' };
  }
  if (!migrated.ok) {
    return { ok: false, error: migrated.error };
  }
  const currentDoc = migrated.doc;

  if (!Array.isArray(currentDoc.lines)) {
    return {
      ok: false,
      error: 'El proyecto JSON no contiene una lista válida de líneas.',
    };
  }

  const rawMeta = isRecord(currentDoc.metadata) ? currentDoc.metadata : undefined;
  const isMs = rawMeta?.timeUnit === 'ms';
  const factorToMs = isMs ? 1 : 1000;

  const linesResult = mapMigratedLines(currentDoc.lines, factorToMs);
  if (!linesResult.ok) {
    return linesResult;
  }

  const metadata: Partial<SongMetadata> = {};
  let audioFileName: string | undefined;

  if (rawMeta) {
    if (typeof rawMeta.title === 'string') metadata.title = rawMeta.title;
    if (typeof rawMeta.artist === 'string') metadata.artist = rawMeta.artist;
    if (typeof rawMeta.album === 'string') metadata.album = rawMeta.album;
    if (typeof rawMeta.offsetMs === 'number' && Number.isFinite(rawMeta.offsetMs)) {
      metadata.offsetMs = rawMeta.offsetMs;
    }
    if (typeof rawMeta.audioFileName === 'string' && rawMeta.audioFileName.trim().length > 0) {
      audioFileName = rawMeta.audioFileName.trim();
    }
  }

  return {
    ok: true,
    data: {
      lines: linesResult.lines,
      metadata,
      ...(audioFileName !== undefined ? { audioFileName } : {}),
    },
  };
}
