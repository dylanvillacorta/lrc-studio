import {
  formatUnknownSchemaError,
  runMigrations,
  type MigrationSteps,
} from '@/lib/schemaMigration';
import {
  STORED_PROJECT_SCHEMA_VERSION,
  type ProjectFullData,
  type UnrestorableCode,
} from '@/types';

/**
 * Versiones conocidas del proyecto guardado en IndexedDB, de la más antigua a la actual.
 * Los registros sin versión se tratan como `1`. Nunca se borran versiones de la lista.
 */
export const KNOWN_STORED_PROJECT_SCHEMA_VERSIONS = [
  1,
  STORED_PROJECT_SCHEMA_VERSION,
] as const;

type StoredDoc = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Pasos de migración del proyecto almacenado. Cada paso produce un documento nuevo (no muta el original).
 * Los pasos existentes nunca se borran ni se reescriben.
 */
export const STORED_PROJECT_MIGRATION_STEPS: MigrationSteps<number, StoredDoc> = {
  // v1 -> v2: elimina la clave inerte settings.sniperMode y fija la versión.
  '1': {
    nextVersion: 2,
    migrate: (doc) => {
      const next: StoredDoc = { ...doc, schemaVersion: 2 };
      if (isRecord(doc.settings)) {
        const { sniperMode: _removed, ...settings } = doc.settings;
        void _removed;
        next.settings = settings;
      }
      return next;
    },
  },
};

export type MigrateStoredProjectResult =
  | { ok: true; project: ProjectFullData }
  | { ok: false; code: UnrestorableCode; reason: string };

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): boolean {
  return value === null || isNumber(value);
}

/**
 * Valida la forma de un proyecto ya migrado a la versión actual. Devuelve el motivo o `null` si es válido.
 */
export function validateStoredProjectShape(doc: StoredDoc): string | null {
  if (typeof doc.id !== 'string' || doc.id.length === 0) return 'falta un id válido';
  if (typeof doc.title !== 'string' || typeof doc.artist !== 'string') {
    return 'título o artista inválidos';
  }
  if (typeof doc.audioFileName !== 'string') return 'nombre de audio inválido';
  const numericFields = [
    'durationMs',
    'totalLines',
    'syncedLines',
    'totalWords',
    'syncedWords',
    'lineProgress',
    'wordProgress',
    'updatedAt',
    'createdAt',
  ];
  for (const field of numericFields) {
    if (!isNumber(doc[field])) return `el campo «${field}» no es numérico`;
  }
  if (!Array.isArray(doc.waveformPeaks)) return 'los picos de onda no son una lista';
  if (!Array.isArray(doc.lines)) return 'las líneas no son una lista';
  for (let i = 0; i < doc.lines.length; i++) {
    const line: unknown = doc.lines[i];
    if (
      !isRecord(line) ||
      typeof line.id !== 'string' ||
      typeof line.text !== 'string' ||
      !isNullableNumber(line.startMs) ||
      !isNullableNumber(line.endMs) ||
      !Array.isArray(line.words)
    ) {
      return `la línea #${i + 1} está mal formada`;
    }
    for (const word of line.words as unknown[]) {
      if (
        !isRecord(word) ||
        typeof word.id !== 'string' ||
        typeof word.text !== 'string' ||
        !isNullableNumber(word.startMs) ||
        !isNullableNumber(word.endMs)
      ) {
        return `una palabra de la línea #${i + 1} está mal formada`;
      }
    }
  }
  const settings = doc.settings;
  if (
    !isRecord(settings) ||
    !isNumber(settings.playbackRate) ||
    !isNumber(settings.preRollSeconds) ||
    typeof settings.autoAdvance !== 'boolean'
  ) {
    return 'los ajustes del proyecto están mal formados';
  }
  return null;
}

/**
 * Comprueba la versión de esquema de un registro guardado, aplica las migraciones paso a paso
 * y valida la forma del resultado. Nunca muta ni borra el registro original.
 */
export function migrateStoredProject(raw: unknown): MigrateStoredProjectResult {
  if (!isRecord(raw)) {
    return { ok: false, code: 'malformed', reason: 'el registro no es un objeto' };
  }

  const rawVersion = raw.schemaVersion;
  const fromVersion = rawVersion === undefined ? 1 : rawVersion;
  if (typeof fromVersion !== 'number' || !Number.isInteger(fromVersion) || fromVersion < 1) {
    return { ok: false, code: 'unknown', reason: formatUnknownSchemaError(rawVersion) };
  }

  let result;
  try {
    result = runMigrations<number, StoredDoc>({
      steps: STORED_PROJECT_MIGRATION_STEPS,
      knownVersions: KNOWN_STORED_PROJECT_SCHEMA_VERSIONS,
      currentVersion: STORED_PROJECT_SCHEMA_VERSION,
      fromVersion,
      doc: raw,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 'migration-failed',
      reason: `falló un paso de migración (${detail})`,
    };
  }

  if (!result.ok) {
    const code: UnrestorableCode =
      result.reason === 'future'
        ? 'future'
        : result.reason === 'unknown'
          ? 'unknown'
          : 'migration-failed';
    return { ok: false, code, reason: result.error };
  }

  const shapeError = validateStoredProjectShape(result.doc);
  if (shapeError) {
    return { ok: false, code: 'malformed', reason: `datos mal formados: ${shapeError}` };
  }

  return {
    ok: true,
    project: {
      ...result.doc,
      schemaVersion: STORED_PROJECT_SCHEMA_VERSION,
    } as unknown as ProjectFullData,
  };
}

/**
 * Error de lectura de un proyecto guardado que no se puede restaurar. El registro original queda intacto.
 */
export class UnrestorableProjectError extends Error {
  readonly projectId: string;
  readonly projectTitle: string | null;
  readonly code: UnrestorableCode;
  readonly reason: string;

  constructor(
    projectId: string,
    projectTitle: string | null,
    code: UnrestorableCode,
    reason: string,
  ) {
    super(
      `No se puede restaurar la transcripción «${projectTitle ?? projectId}»: ${reason}. Tus datos siguen guardados sin cambios; puedes descargar el original desde Mis transcripciones.`,
    );
    this.name = 'UnrestorableProjectError';
    this.projectId = projectId;
    this.projectTitle = projectTitle;
    this.code = code;
    this.reason = reason;
  }
}
