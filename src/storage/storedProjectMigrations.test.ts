import { describe, expect, it } from 'vitest';
import { STORED_PROJECT_SCHEMA_VERSION } from '@/types';
import backupV1 from './__fixtures__/backup.v1.json';
import storedV1 from './__fixtures__/stored-project.v1.json';
import { BACKUP_MIGRATION_STEPS, KNOWN_BACKUP_SCHEMA_VERSIONS, migrateBackupJson } from './backupMigrations';
import {
  KNOWN_STORED_PROJECT_SCHEMA_VERSIONS,
  STORED_PROJECT_MIGRATION_STEPS,
  migrateStoredProject,
} from './storedProjectMigrations';

/** Fixtures por versión conocida: nunca se borran ni se reescriben; se agrega uno por cada versión nueva. */
const STORED_FIXTURES: Record<number, unknown> = { 1: storedV1 };

describe('garantía: cadena de proyecto almacenado', () => {
  it('cada versión conocida excepto la actual tiene paso de migración', () => {
    const current = KNOWN_STORED_PROJECT_SCHEMA_VERSIONS[KNOWN_STORED_PROJECT_SCHEMA_VERSIONS.length - 1];
    expect(current).toBe(STORED_PROJECT_SCHEMA_VERSION);
    for (const version of KNOWN_STORED_PROJECT_SCHEMA_VERSIONS) {
      if (version !== STORED_PROJECT_SCHEMA_VERSION) {
        expect(STORED_PROJECT_MIGRATION_STEPS[String(version)], `paso desde v${version}`).toBeDefined();
      }
    }
  });

  it('el fixture de cada versión conocida migra hasta la actual y produce datos válidos', () => {
    for (const version of KNOWN_STORED_PROJECT_SCHEMA_VERSIONS) {
      if (version === STORED_PROJECT_SCHEMA_VERSION) continue;
      const fixture = STORED_FIXTURES[version];
      expect(fixture, `falta fixture v${version}`).toBeDefined();
      const result = migrateStoredProject(fixture);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.project.schemaVersion).toBe(STORED_PROJECT_SCHEMA_VERSION);
      }
    }
  });

  it('v1 -> v2 elimina settings.sniperMode sin mutar el original', () => {
    const before = JSON.stringify(storedV1);
    const result = migrateStoredProject(storedV1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('sniperMode' in result.project.settings).toBe(false);
      expect(result.project.settings.autoAdvance).toBe(true);
      expect(result.project.lines).toHaveLength(1);
    }
    expect(JSON.stringify(storedV1)).toBe(before);
  });
});

describe('migrateStoredProject: casos de rechazo', () => {
  it('versión futura', () => {
    const r = migrateStoredProject({ ...storedV1, schemaVersion: 99 });
    expect(r).toMatchObject({ ok: false, code: 'future' });
  });

  it('versión desconocida', () => {
    expect(migrateStoredProject({ ...storedV1, schemaVersion: 'x' })).toMatchObject({ ok: false, code: 'unknown' });
    expect(migrateStoredProject({ ...storedV1, schemaVersion: 0 })).toMatchObject({ ok: false, code: 'unknown' });
  });

  it('mal formado (lista de líneas inválida, no objeto)', () => {
    expect(migrateStoredProject({ ...storedV1, lines: 'x' })).toMatchObject({ ok: false, code: 'malformed' });
    expect(migrateStoredProject(null)).toMatchObject({ ok: false, code: 'malformed' });
    expect(migrateStoredProject({ ...storedV1, settings: null })).toMatchObject({ ok: false, code: 'malformed' });
  });

  it('paso faltante y paso que lanza', () => {
    const saved = STORED_PROJECT_MIGRATION_STEPS['1'];
    try {
      delete STORED_PROJECT_MIGRATION_STEPS['1'];
      expect(migrateStoredProject(storedV1)).toMatchObject({ ok: false, code: 'migration-failed' });
      STORED_PROJECT_MIGRATION_STEPS['1'] = {
        nextVersion: 2,
        migrate: () => {
          throw new Error('boom');
        },
      };
      const r = migrateStoredProject(storedV1);
      expect(r).toMatchObject({ ok: false, code: 'migration-failed' });
      if (!r.ok) expect(r.reason).toContain('boom');
    } finally {
      STORED_PROJECT_MIGRATION_STEPS['1'] = saved;
    }
  });
});

describe('garantía: cadena de respaldo', () => {
  it('cada versión conocida excepto la actual tiene paso', () => {
    for (const version of KNOWN_BACKUP_SCHEMA_VERSIONS) {
      if (version !== 1) {
        expect(BACKUP_MIGRATION_STEPS[String(version)]).toBeDefined();
      }
    }
    expect(KNOWN_BACKUP_SCHEMA_VERSIONS[KNOWN_BACKUP_SCHEMA_VERSIONS.length - 1]).toBe(1);
  });

  it('el fixture v1 migra hasta la actual con datos válidos', () => {
    const result = migrateBackupJson(backupV1 as Record<string, unknown>);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const projects = result.doc.projects as unknown[];
      expect(migrateStoredProject(projects[0]).ok).toBe(true);
    }
  });

  it('rechaza versión futura, desconocida o ausente', () => {
    expect(migrateBackupJson({ schemaVersion: 2 })).toMatchObject({ ok: false });
    expect(migrateBackupJson({ schemaVersion: 'a' })).toMatchObject({ ok: false });
    const missing = migrateBackupJson({});
    expect(missing.ok).toBe(false);
  });
});
