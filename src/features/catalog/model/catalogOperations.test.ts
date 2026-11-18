import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { WebIndexedDBAdapter } from '@/storage';
import type { CatalogBackup } from '@/types';
import {
  createCatalogProject,
  deleteCatalogProject,
  duplicateCatalogProject,
  exportCatalogProjectBackup,
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
  });

  it('lanza error en español al intentar duplicar o exportar un proyecto inexistente', async () => {
    await expect(duplicateCatalogProject(adapter, 'no-existe')).rejects.toThrow(
      /No se encontró/,
    );
    await expect(exportCatalogProjectBackup(adapter, 'no-existe')).rejects.toThrow(
      /No se encontró/,
    );
  });
});
