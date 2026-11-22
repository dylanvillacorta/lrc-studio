/**
 * Utilidad genérica y pura de migración de esquemas paso a paso (v1 -> v2 -> v3 ...).
 * Los pasos nunca se borran: cualquier versión conocida debe poder llegar a la actual.
 */

export type SchemaVersion = string | number;

export interface MigrationStep<V extends SchemaVersion, D> {
  nextVersion: V;
  migrate: (doc: D) => D;
}

export type MigrationSteps<V extends SchemaVersion, D> = Partial<
  Record<string, MigrationStep<V, D>>
>;

export type MigrationFailureReason = 'unknown' | 'future' | 'missing-step' | 'cycle';

export type MigrationResult<D> =
  | { ok: true; doc: D }
  | { ok: false; reason: MigrationFailureReason; error: string };

export interface RunMigrationsOptions<V extends SchemaVersion, D> {
  steps: MigrationSteps<V, D>;
  /** Versiones conocidas, de la más antigua a la actual. */
  knownVersions: readonly V[];
  currentVersion: V;
  fromVersion: V;
  doc: D;
}

/**
 * Mensaje estándar para esquemas desconocidos o posteriores a la versión actual.
 */
export function formatUnknownSchemaError(rawVersion: unknown): string {
  let label: string;
  if (typeof rawVersion === 'string' || typeof rawVersion === 'number') {
    label = String(rawVersion);
  } else {
    try {
      label = JSON.stringify(rawVersion) ?? String(rawVersion);
    } catch {
      label = String(rawVersion);
    }
  }
  return `Esta versión de LRC Studio no reconoce el esquema "${label}", actualiza la app.`;
}

/**
 * Aplica los pasos uno a uno desde `fromVersion` hasta `currentVersion`.
 * Nunca continúa en silencio: un paso faltante, una versión desconocida/futura o un ciclo devuelven error.
 */
export function runMigrations<V extends SchemaVersion, D>(
  options: RunMigrationsOptions<V, D>,
): MigrationResult<D> {
  const { steps, knownVersions, currentVersion, fromVersion } = options;

  if (!knownVersions.includes(fromVersion)) {
    const future =
      typeof fromVersion === 'number' &&
      typeof currentVersion === 'number' &&
      fromVersion > currentVersion;
    return {
      ok: false,
      reason: future ? 'future' : 'unknown',
      error: formatUnknownSchemaError(fromVersion),
    };
  }

  let version: V = fromVersion;
  let doc = options.doc;
  const visited = new Set<string>();

  while (version !== currentVersion) {
    const key = String(version);
    if (visited.has(key)) {
      return {
        ok: false,
        reason: 'cycle',
        error: `La cadena de migración del esquema "${key}" contiene un ciclo.`,
      };
    }
    visited.add(key);

    const step = steps[key];
    if (!step) {
      return {
        ok: false,
        reason: 'missing-step',
        error: `Falta el paso de migración desde el esquema "${key}" hacia "${String(currentVersion)}".`,
      };
    }
    doc = step.migrate(doc);
    version = step.nextVersion;
  }

  return { ok: true, doc };
}
