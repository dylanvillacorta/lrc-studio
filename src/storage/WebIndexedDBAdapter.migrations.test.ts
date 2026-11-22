import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { loadCatalog, exportRawProject } from '@/features/catalog/model/catalogOperations';
import { restoreSessionFromAdapter } from '@/features/session/hooks/useSessionRestore';
import { STORED_PROJECT_SCHEMA_VERSION, type ProjectFullData } from '@/types';
import backupV1 from './__fixtures__/backup.v1.json';
import storedV1 from './__fixtures__/stored-project.v1.json';
import { UnrestorableProjectError, WebIndexedDBAdapter } from './index';

let counter = 0;
const nextDb = () => `migr-test-${++counter}-${Date.now()}`;

function openRaw(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putRaw(dbName: string, record: unknown, store = 'projects'): Promise<void> {
  const db = await openRaw(dbName);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getRaw(dbName: string, id: string): Promise<unknown> {
  const db = await openRaw(dbName);
  const value = await new Promise<unknown>((resolve, reject) => {
    const req = db.transaction('projects', 'readonly').objectStore('projects').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}

async function setup(): Promise<{ dbName: string; adapter: WebIndexedDBAdapter }> {
  const dbName = nextDb();
  const adapter = new WebIndexedDBAdapter({ dbName, storage: null });
  await adapter.init();
  return { dbName, adapter };
}

const BAD_RECORDS: Record<string, unknown> = {
  malformed: { ...storedV1, id: 'bad', lines: 'no es lista' },
  future: { ...storedV1, id: 'bad', schemaVersion: 99, extra: { nuevo: true } },
  unknown: { ...storedV1, id: 'bad', schemaVersion: 'rara' },
};

describe('WebIndexedDBAdapter: migración al leer y registros no restaurables', () => {
  it('migra en memoria un proyecto v1 con sniperMode al leer y no lo reescribe hasta guardar', async () => {
    const { dbName, adapter } = await setup();
    await putRaw(dbName, storedV1);

    const loaded = await adapter.getProject('fixture-v1');
    expect(loaded?.schemaVersion).toBe(STORED_PROJECT_SCHEMA_VERSION);
    expect(loaded && 'sniperMode' in loaded.settings).toBe(false);
    expect(await getRaw(dbName, 'fixture-v1')).toEqual(storedV1);

    await adapter.saveProject(loaded as ProjectFullData);
    const stored = (await getRaw(dbName, 'fixture-v1')) as ProjectFullData;
    expect(stored.schemaVersion).toBe(STORED_PROJECT_SCHEMA_VERSION);
    expect('sniperMode' in stored.settings).toBe(false);
  });

  for (const [kind, record] of Object.entries(BAD_RECORDS)) {
    it(`registro ${kind}: getProject falla con error claro y el original queda intacto`, async () => {
      const { dbName, adapter } = await setup();
      await putRaw(dbName, record);

      await expect(adapter.getProject('bad')).rejects.toBeInstanceOf(UnrestorableProjectError);
      await expect(adapter.getProject('bad')).rejects.toThrow(/No se puede restaurar/);
      expect(await getRaw(dbName, 'bad')).toEqual(record);

      const list = await adapter.listUnrestorableProjects();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: 'bad' });
      expect(list[0]?.reason.length).toBeGreaterThan(0);

      const raw = await adapter.getRawProjectJson('bad');
      expect(JSON.parse(raw as string)).toEqual(record);
    });

    it(`registro ${kind}: saveProject (autoguardado) no lo sobrescribe`, async () => {
      const { dbName, adapter } = await setup();
      await putRaw(dbName, record);
      const empty = { ...storedV1, id: 'bad', lines: [], schemaVersion: 2 } as unknown as ProjectFullData;

      await expect(adapter.saveProject(empty)).rejects.toBeInstanceOf(UnrestorableProjectError);
      expect(await getRaw(dbName, 'bad')).toEqual(record);
    });

    it(`registro ${kind}: importar un respaldo con el mismo id no lo pisa ni escribe nada parcial`, async () => {
      const { dbName, adapter } = await setup();
      await putRaw(dbName, record);
      const backup = {
        ...backupV1,
        projects: [
          { ...backupV1.projects[0], id: 'otro' },
          { ...backupV1.projects[0], id: 'bad' },
        ],
      };

      await expect(adapter.importCatalogBackup(JSON.stringify(backup))).rejects.toBeInstanceOf(
        UnrestorableProjectError,
      );
      expect(await getRaw(dbName, 'bad')).toEqual(record);
      expect(await getRaw(dbName, 'otro')).toBeUndefined();
    });

    it(`registro ${kind}: el catálogo lo lista como no restaurable y la restauración de sesión arranca con aviso`, async () => {
      const { dbName, adapter } = await setup();
      await putRaw(dbName, record);
      await adapter.saveSessionState({
        projectId: 'bad',
        activeTab: 'sync',
        currentTime: 0,
        activeLineIndex: 0,
        activeWordIndex: 0,
        updatedAt: 1,
      });

      const catalog = await loadCatalog(adapter);
      expect(catalog.projects).toHaveLength(0);
      expect(catalog.unrestorable.map((u) => u.id)).toEqual(['bad']);

      const download = await exportRawProject(adapter, 'bad', catalog.unrestorable[0]?.title);
      expect(JSON.parse(download.json)).toEqual(record);
      expect(download.fileName.endsWith('-original.json')).toBe(true);

      const restored = await restoreSessionFromAdapter(adapter);
      expect(restored.status).toBe('empty');
      expect(restored.status === 'empty' && restored.notice).toMatch(/No se puede restaurar/);
      expect(await getRaw(dbName, 'bad')).toEqual(record);
    });
  }

  it('un paso de migración que lanza no destruye el registro', async () => {
    const { dbName, adapter } = await setup();
    // Registro v1 con settings que hace fallar la validación tras migrar (mal formado tras migrar).
    const record = { ...storedV1, id: 'x', settings: { playbackRate: 'rápido' } };
    await putRaw(dbName, record);
    await expect(adapter.getProject('x')).rejects.toThrow(/mal formados/);
    expect(await getRaw(dbName, 'x')).toEqual(record);
  });

  it('exportar respaldo falla con mensaje claro si hay un registro no restaurable', async () => {
    const { dbName, adapter } = await setup();
    await putRaw(dbName, BAD_RECORDS.future);
    await expect(adapter.exportFullCatalogBackup()).rejects.toThrow(/No se puede generar el respaldo/);
    expect(await getRaw(dbName, 'bad')).toEqual(BAD_RECORDS.future);
  });

  it('importa un respaldo v1 con sniperMode migrándolo a la versión actual', async () => {
    const { adapter } = await setup();
    await adapter.importCatalogBackup(JSON.stringify(backupV1));
    const loaded = await adapter.getProject('fixture-backup-v1');
    expect(loaded?.schemaVersion).toBe(STORED_PROJECT_SCHEMA_VERSION);
    expect(loaded && 'sniperMode' in loaded.settings).toBe(false);
  });

  it('un respaldo con versión futura o proyecto mal formado no escribe nada', async () => {
    const { dbName, adapter } = await setup();
    await expect(
      adapter.importCatalogBackup(JSON.stringify({ ...backupV1, schemaVersion: 2 })),
    ).rejects.toThrow(/no reconoce el esquema "2"/);
    const broken = {
      ...backupV1,
      projects: [
        { ...backupV1.projects[0], id: 'ok1' },
        { ...backupV1.projects[0], id: 'roto', schemaVersion: 99 },
      ],
    };
    await expect(adapter.importCatalogBackup(JSON.stringify(broken))).rejects.toThrow(/no se puede importar/);
    expect(await getRaw(dbName, 'ok1')).toBeUndefined();
  });
});
