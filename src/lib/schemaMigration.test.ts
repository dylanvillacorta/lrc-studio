import { describe, expect, it } from 'vitest';
import { runMigrations, type MigrationSteps } from './schemaMigration';

type Doc = { trail: string[] };

const steps: MigrationSteps<number, Doc> = {
  '1': { nextVersion: 2, migrate: (d) => ({ trail: [...d.trail, '1>2'] }) },
  '2': { nextVersion: 3, migrate: (d) => ({ trail: [...d.trail, '2>3'] }) },
};

describe('runMigrations', () => {
  it('aplica los pasos uno a uno hasta la versión actual', () => {
    const r = runMigrations({ steps, knownVersions: [1, 2, 3], currentVersion: 3, fromVersion: 1, doc: { trail: [] } });
    expect(r).toEqual({ ok: true, doc: { trail: ['1>2', '2>3'] } });
  });

  it('no hace nada si ya está en la versión actual', () => {
    const r = runMigrations({ steps, knownVersions: [1, 2, 3], currentVersion: 3, fromVersion: 3, doc: { trail: [] } });
    expect(r).toEqual({ ok: true, doc: { trail: [] } });
  });

  it('falla con claridad si falta un paso', () => {
    const r = runMigrations({ steps: { '1': steps['1']! }, knownVersions: [1, 2, 3], currentVersion: 3, fromVersion: 1, doc: { trail: [] } });
    expect(r).toMatchObject({ ok: false, reason: 'missing-step' });
  });

  it('rechaza versiones futuras y desconocidas', () => {
    const future = runMigrations({ steps, knownVersions: [1, 2, 3], currentVersion: 3, fromVersion: 4, doc: { trail: [] } });
    expect(future).toMatchObject({ ok: false, reason: 'future' });
    if (!future.ok) {
      expect(future.error).toBe('Esta versión de LRC Studio no reconoce el esquema "4", actualiza la app.');
    }
    const unknown = runMigrations<string, Doc>({ steps: {}, knownVersions: ['a'], currentVersion: 'a', fromVersion: 'z', doc: { trail: [] } });
    expect(unknown).toMatchObject({ ok: false, reason: 'unknown' });
  });

  it('protege contra ciclos', () => {
    const cyc: MigrationSteps<number, Doc> = {
      '1': { nextVersion: 2, migrate: (d) => d },
      '2': { nextVersion: 1, migrate: (d) => d },
    };
    const r = runMigrations({ steps: cyc, knownVersions: [1, 2, 3], currentVersion: 3, fromVersion: 1, doc: { trail: [] } });
    expect(r).toMatchObject({ ok: false, reason: 'cycle' });
  });
});
