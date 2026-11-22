import {
  formatUnknownSchemaError,
  runMigrations,
  type MigrationSteps,
} from '@/lib/schemaMigration';
import { BACKUP_SCHEMA_VERSION } from '@/types';

/**
 * Versiones conocidas del respaldo del catálogo, de la más antigua a la actual.
 * Nunca se borran versiones de la lista.
 */
export const KNOWN_BACKUP_SCHEMA_VERSIONS = [1] as const satisfies readonly number[];

type BackupDoc = Record<string, unknown>;

/**
 * Pasos de migración del respaldo. Hoy no hay ninguno (solo existe la versión 1).
 * Para agregar la versión 2: subir `BACKUP_SCHEMA_VERSION`, agregar `2` a la lista de versiones
 * conocidas y agregar aquí el paso `'1': { nextVersion: 2, migrate }`. Nunca borrar pasos.
 */
export const BACKUP_MIGRATION_STEPS: MigrationSteps<number, BackupDoc> = {};

export type MigrateBackupResult =
  | { ok: true; doc: BackupDoc }
  | { ok: false; error: string };

/**
 * Comprueba la versión del respaldo y lo migra paso a paso hasta la versión actual.
 */
export function migrateBackupJson(parsed: BackupDoc): MigrateBackupResult {
  const version = parsed.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return { ok: false, error: formatUnknownSchemaError(version) };
  }

  try {
    const result = runMigrations<number, BackupDoc>({
      steps: BACKUP_MIGRATION_STEPS,
      knownVersions: KNOWN_BACKUP_SCHEMA_VERSIONS as readonly number[],
      currentVersion: BACKUP_SCHEMA_VERSION,
      fromVersion: version,
      doc: parsed,
    });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return { ok: true, doc: result.doc };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Falló un paso de migración del respaldo (${detail}).` };
  }
}
