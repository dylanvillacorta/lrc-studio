import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import babiFixture from '@/features/export/model/__fixtures__/babi-pa-ti.project.json';
import { WebIndexedDBAdapter } from '@/storage';
import type { CatalogBackup } from '@/types';
import {
  createCatalogProject,
  deleteCatalogProject,
  duplicateCatalogProject,
  exportCatalogProjectBackup,
  importCatalogBackupFromJson,
  loadCatalogProjects,
} from './catalogOperations';

let dbCounter = 0;

function createIsolatedAdapter(): WebIndexedDBAdapter {
  dbCounter += 1;
  return new WebIndexedDBAdapter({
    dbName: `lrc-catalog-test-${dbCounter}-${Date.now()}`,
    storage: null,
  });
}

describe('catalogOperations con WebIndexedDBAdapter', () => {
  let adapter: WebIndexedDBAdapter;

  beforeEach(async () => {
    adapter = createIsolatedAdapter();
    await adapter.init();
  });

  it('crea, lista, duplica (con audio), exporta y elimina un proyecto', async () => {
    const created = await createCatalogProject(adapter, 'Costa Norte', 'Faro');
    const audioBuffer = new Uint8Array([10, 20, 30, 40]).buffer;
    await adapter.saveAudioBinary(
      created.id,
      audioBuffer,
      'costa_norte.mp3',
      [0.2, 0.8],
      125,
    );

    const list1 = await loadCatalogProjects(adapter);
    expect(list1).toHaveLength(1);
    expect(list1[0]?.title).toBe('Costa Norte');

    const duplicated = await duplicateCatalogProject(
      adapter,
      created.id,
      'copy-id-1',
      created.updatedAt + 1000,
    );
    expect(duplicated.title).toBe('Costa Norte (copia)');

    const duplicatedAudio = await adapter.getAudioBinary('copy-id-1');
    expect(duplicatedAudio).not.toBeNull();
    expect(duplicatedAudio?.fileName).toBe('costa_norte.mp3');

    const exported = await exportCatalogProjectBackup(adapter, created.id);
    expect(exported.fileName).toBe('Costa Norte-respaldo.json');
    expect(exported.blob.type).toBe('application/json');

    const parsed = JSON.parse(exported.json) as CatalogBackup;
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.audios).toHaveLength(1);

    await deleteCatalogProject(adapter, created.id);
    const list2 = await loadCatalogProjects(adapter);
    expect(list2).toHaveLength(1);
    expect(list2[0]?.id).toBe('copy-id-1');

    const freshAdapter = createIsolatedAdapter();
    await importCatalogBackupFromJson(freshAdapter, exported.json);
    const importedList = await loadCatalogProjects(freshAdapter);
    expect(importedList).toHaveLength(1);
    expect(importedList[0]?.title).toBe('Costa Norte');
  });

  it('lanza error en español al intentar duplicar o exportar un proyecto inexistente', async () => {
    await expect(duplicateCatalogProject(adapter, 'no-existe')).rejects.toThrow(
      /No se encontró/,
    );
    await expect(exportCatalogProjectBackup(adapter, 'no-existe')).rejects.toThrow(
      /No se encontró/,
    );
  });

  it('importa un proyecto JSON exportado (fixture Babi - Pa ti) creando proyecto sin audio y con progreso', async () => {
    const rawJson = JSON.stringify(babiFixture);
    await importCatalogBackupFromJson(adapter, rawJson);

    const list = await loadCatalogProjects(adapter);
    expect(list).toHaveLength(1);

    const summary = list[0]!;
    expect(summary.title).toBe('Pa ti');
    expect(summary.artist).toBe('Babi');
    expect(summary.audioFileName).toBe('Grind – Pa Ti.mp3');
    expect(summary.totalLines).toBeGreaterThanOrEqual(40);
    expect(summary.syncedLines).toBeGreaterThan(0);

    const full = await adapter.getProject(summary.id);
    expect(full).not.toBeNull();
    expect(full?.lines.length).toBeGreaterThanOrEqual(40);
    expect(full?.lines[0]?.startMs).toBe(7153);

    const audio = await adapter.getAudioBinary(summary.id);
    expect(audio).toBeNull();

    // Importar dos veces el mismo proyecto crea dos entradas con ids únicos
    await importCatalogBackupFromJson(adapter, rawJson);
    const listTwice = await loadCatalogProjects(adapter);
    expect(listTwice).toHaveLength(2);
    expect(listTwice[0]?.id).not.toBe(listTwice[1]?.id);
  });

  it('asigna Sin título si el proyecto JSON importado tiene título vacío y rechaza formatos desconocidos', async () => {
    await importCatalogBackupFromJson(
      adapter,
      JSON.stringify({
        schemaVersion: '1.0',
        metadata: { title: '   ', artist: 'Anónimo' },
        lines: [{ text: 'Verso', startTime: 1, endTime: 2, words: [] }],
      }),
    );

    const list = await loadCatalogProjects(adapter);
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe('Sin título');

    await expect(
      importCatalogBackupFromJson(adapter, JSON.stringify({ foo: 'bar' })),
    ).rejects.toThrow(/respaldo de catálogo o un proyecto JSON de LRC Studio/);
  });
});
