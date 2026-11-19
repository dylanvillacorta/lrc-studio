import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  type ProjectFullData,
  type SessionState,
} from '@/types';
import {
  TauriRustSqliteAdapter,
  WebIndexedDBAdapter,
  createStorageAdapter,
  storageService,
  type StorageLike,
} from './index';

let dbCounter = 0;

function nextDbName(): string {
  dbCounter += 1;
  return `lyricsync-studio-test-${dbCounter}-${Date.now()}`;
}

function makeProject(overrides: Partial<ProjectFullData> = {}): ProjectFullData {
  return {
    id: 'proj-1',
    title: 'Canción de prueba',
    artist: 'Artista Demo',
    audioFileName: 'demo.mp3',
    durationMs: 120_000,
    totalLines: 1,
    syncedLines: 1,
    totalWords: 2,
    syncedWords: 2,
    lineProgress: 100,
    wordProgress: 100,
    updatedAt: 1_700_000_000_000,
    createdAt: 1_699_999_000_000,
    lines: [
      {
        id: 'line-1',
        text: 'Hola mundo',
        startMs: 500,
        endMs: 2000,
        words: [
          { id: 'w-1', text: 'Hola', startMs: 500, endMs: 1100 },
          { id: 'w-2', text: 'mundo', startMs: 1150, endMs: 2000 },
        ],
      },
    ],
    waveformPeaks: [0.1, 0.4, 0.8, 0.3],
    settings: {
      playbackRate: 1,
      preRollSeconds: 2.5,
      sniperMode: false,
      autoAdvance: true,
    },
    ...overrides,
  };
}

function makeMemoryStorage(): StorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
  };
}

describe('WebIndexedDBAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('init es idempotente incluso con llamadas concurrentes', async () => {
    const adapter = new WebIndexedDBAdapter({ dbName: nextDbName(), storage: null });
    await Promise.all([adapter.init(), adapter.init()]);
    await adapter.init();

    const projects = await adapter.listProjects();
    expect(projects).toEqual([]);
  });

  it('guarda y lee un proyecto completo, y devuelve null si no existe', async () => {
    const adapter = new WebIndexedDBAdapter({ dbName: nextDbName(), storage: null });
    await adapter.init();

    expect(await adapter.getProject('inexistente')).toBeNull();

    const project = makeProject({ id: 'p-read-write' });
    await adapter.saveProject(project);

    const loaded = await adapter.getProject('p-read-write');
    expect(loaded).toEqual(project);
  });

  it('listProjects devuelve resúmenes ligeros ordenados por updatedAt descendente', async () => {
    const adapter = new WebIndexedDBAdapter({ dbName: nextDbName(), storage: null });
    await adapter.init();

    await adapter.saveProject(makeProject({ id: 'p-old', title: 'Antiguo', updatedAt: 1000 }));
    await adapter.saveProject(makeProject({ id: 'p-new', title: 'Reciente', updatedAt: 3000 }));
    await adapter.saveProject(makeProject({ id: 'p-mid', title: 'Medio', updatedAt: 2000 }));

    const list = await adapter.listProjects();
    expect(list.map((item) => item.id)).toEqual(['p-new', 'p-mid', 'p-old']);

    const first = list[0];
    expect(first).toBeDefined();
    expect('lines' in (first as unknown as Record<string, unknown>)).toBe(false);
    expect('waveformPeaks' in (first as unknown as Record<string, unknown>)).toBe(false);
  });

  it('guarda y recupera audio desde ArrayBuffer y desde Blob preservando bytes, mime, peaks y duration', async () => {
    const adapter = new WebIndexedDBAdapter({ dbName: nextDbName(), storage: null });
    await adapter.init();

    expect(await adapter.getAudioBinary('sin-audio')).toBeNull();

    const project = makeProject({
      id: 'p-audio',
      audioFileName: '',
      durationMs: 0,
    });
    await adapter.saveProject(project);

    const rawBytes = new Uint8Array([10, 20, 30, 40, 50, 255, 0, 127]);
    const peaks = [0.2, 0.9, 0.5];
    await adapter.saveAudioBinary('p-audio', rawBytes.buffer, 'tema.mp3', peaks, 42.5);

    const fromBuffer = await adapter.getAudioBinary('p-audio');
    expect(fromBuffer).not.toBeNull();
    expect(fromBuffer?.fileName).toBe('tema.mp3');
    expect(fromBuffer?.peaks).toEqual(peaks);
    expect(fromBuffer?.duration).toBe(42.5);
    expect(fromBuffer?.blob).toBeInstanceOf(Blob);
    expect((fromBuffer?.blob as Blob).type).toBe('audio/mpeg');
    const loadedBufferBytes = new Uint8Array(await (fromBuffer?.blob as Blob).arrayBuffer());
    expect(loadedBufferBytes).toEqual(rawBytes);

    const summaries = await adapter.listProjects();
    expect(summaries[0]?.audioFileName).toBe('tema.mp3');
    expect(summaries[0]?.durationMs).toBe(42_500);

    const wavBytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
    const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
    await adapter.saveAudioBinary('p-blob', wavBlob, 'pista.wav', [0.1], 12);

    const fromBlob = await adapter.getAudioBinary('p-blob');
    expect(fromBlob).not.toBeNull();
    expect((fromBlob?.blob as Blob).type).toBe('audio/wav');
    const loadedWavBytes = new Uint8Array(await (fromBlob?.blob as Blob).arrayBuffer());
    expect(loadedWavBytes).toEqual(wavBytes);
  });

  it('deleteProject elimina proyecto, resumen y binario de audio en una transacción', async () => {
    const adapter = new WebIndexedDBAdapter({ dbName: nextDbName(), storage: null });
    await adapter.init();

    const project = makeProject({ id: 'p-del' });
    await adapter.saveProject(project);
    await adapter.saveAudioBinary('p-del', new Uint8Array([1, 2, 3]).buffer, 'del.mp3', [0.5], 5);

    await adapter.deleteProject('p-del');

    expect(await adapter.getProject('p-del')).toBeNull();
    expect(await adapter.getAudioBinary('p-del')).toBeNull();
    expect(await adapter.listProjects()).toEqual([]);
  });

  it('guarda y restaura sesión con localStorage inyectado y hace fallback a IndexedDB sin localStorage', async () => {
    const dbName = nextDbName();
    const memoryStorage = makeMemoryStorage();
    const adapterWithLs = new WebIndexedDBAdapter({ dbName, storage: memoryStorage });
    await adapterWithLs.init();

    expect(await adapterWithLs.getSessionState()).toBeNull();

    const session: SessionState = {
      projectId: 'proj-1',
      activeTab: 'word',
      currentTime: 15.25,
      activeLineIndex: 2,
      activeWordIndex: 4,
      updatedAt: 1_700_000_123_000,
    };
    await adapterWithLs.saveSessionState(session);

    expect(memoryStorage.store.has('lyricsync:session')).toBe(true);
    expect(await adapterWithLs.getSessionState()).toEqual(session);

    const adapterWithoutLs = new WebIndexedDBAdapter({ dbName, storage: null });
    await adapterWithoutLs.init();
    expect(await adapterWithoutLs.getSessionState()).toEqual(session);

    const newSession: SessionState = {
      ...session,
      activeTab: 'loupe',
      currentTime: 30.5,
      updatedAt: 1_700_000_200_000,
    };
    await adapterWithoutLs.saveSessionState(newSession);
    expect(await adapterWithoutLs.getSessionState()).toEqual(newSession);
  });

  it('exporta e importa respaldo completo en una base nueva de forma idempotente', async () => {
    const source = new WebIndexedDBAdapter({ dbName: nextDbName(), storage: null });
    await source.init();

    const p1 = makeProject({ id: 'p-1', title: 'Uno', updatedAt: 100 });
    const p2 = makeProject({ id: 'p-2', title: 'Dos', updatedAt: 200 });
    const audioBytes = new Uint8Array([7, 14, 21, 28, 35, 42]);

    await source.saveProject(p1);
    await source.saveProject(p2);
    await source.saveAudioBinary('p-1', audioBytes.buffer, 'uno.ogg', [0.3, 0.7], 18.5);

    const backupJson = await source.exportFullCatalogBackup();
    const parsed = JSON.parse(backupJson) as { schemaVersion: number };
    expect(parsed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);

    const target = new WebIndexedDBAdapter({ dbName: nextDbName(), storage: null });
    await target.init();
    await target.importCatalogBackup(backupJson);
    await target.importCatalogBackup(backupJson);

    const targetList = await target.listProjects();
    expect(targetList.map((p) => p.id)).toEqual(['p-2', 'p-1']);
    expect(await target.getProject('p-1')).toEqual(p1);
    expect(await target.getProject('p-2')).toEqual(p2);

    const restoredAudio = await target.getAudioBinary('p-1');
    expect(restoredAudio).not.toBeNull();
    expect(restoredAudio?.fileName).toBe('uno.ogg');
    expect((restoredAudio?.blob as Blob).type).toBe('audio/ogg');
    expect(restoredAudio?.peaks).toEqual([0.3, 0.7]);
    expect(restoredAudio?.duration).toBe(18.5);
    const restoredBytes = new Uint8Array(await (restoredAudio?.blob as Blob).arrayBuffer());
    expect(restoredBytes).toEqual(audioBytes);
  });

  it('rechaza respaldos inválidos con mensajes de error descriptivos en español', async () => {
    const adapter = new WebIndexedDBAdapter({ dbName: nextDbName(), storage: null });
    await adapter.init();

    await expect(adapter.importCatalogBackup('{json roto')).rejects.toThrow(/JSON válido/i);
    await expect(
      adapter.importCatalogBackup(JSON.stringify({ schemaVersion: 99, projects: [], audios: [] })),
    ).rejects.toThrow(/Versión de esquema/i);
    await expect(
      adapter.importCatalogBackup(JSON.stringify({ schemaVersion: 1, projects: 'mal', audios: [] })),
    ).rejects.toThrow(/estructura del respaldo/i);
  });

  it('conserva bytes exactos y mime audio/flac en ida y vuelta y en respaldo JSON', async () => {
    const source = new WebIndexedDBAdapter({ dbName: nextDbName(), storage: null });
    await source.init();

    const flacBytes = new Uint8Array([
      0x66, 0x4c, 0x61, 0x43, // fLaC
      0x80, 0x00, 0x00, 0x22, // STREAMINFO
      0x10, 0x00, 0x10, 0x00,
    ]);
    const project = makeProject({ id: 'p-flac', title: 'Master FLAC' });
    await source.saveProject(project);
    await source.saveAudioBinary('p-flac', flacBytes.buffer, 'master.FLAC', [0.25, 0.75], 1.5);

    const direct = await source.getAudioBinary('p-flac');
    expect(direct).not.toBeNull();
    expect(direct?.fileName).toBe('master.FLAC');
    expect((direct?.blob as Blob).type).toBe('audio/flac');
    expect(new Uint8Array(await (direct?.blob as Blob).arrayBuffer())).toEqual(flacBytes);

    const backupJson = await source.exportFullCatalogBackup();
    const parsed = JSON.parse(backupJson) as {
      audios: { mimeType: string; fileName: string }[];
    };
    expect(parsed.audios[0]?.mimeType).toBe('audio/flac');
    expect(parsed.audios[0]?.fileName).toBe('master.FLAC');

    const target = new WebIndexedDBAdapter({ dbName: nextDbName(), storage: null });
    await target.init();
    await target.importCatalogBackup(backupJson);

    const restored = await target.getAudioBinary('p-flac');
    expect(restored).not.toBeNull();
    expect((restored?.blob as Blob).type).toBe('audio/flac');
    expect(new Uint8Array(await (restored?.blob as Blob).arrayBuffer())).toEqual(flacBytes);
  });

  it('persiste latencyMs en meta/localStorage con valor por defecto 0 y acotado a 0..500', async () => {
    const dbName = nextDbName();
    const memoryStorage = makeMemoryStorage();
    const adapter = new WebIndexedDBAdapter({ dbName, storage: memoryStorage });
    await adapter.init();

    expect(await adapter.getLatencyMs()).toBe(0);

    await adapter.saveLatencyMs(200);
    expect(await adapter.getLatencyMs()).toBe(200);

    // Nueva instancia sin localStorage lee desde IndexedDB meta
    const adapterOnlyIdb = new WebIndexedDBAdapter({ dbName, storage: null });
    await adapterOnlyIdb.init();
    expect(await adapterOnlyIdb.getLatencyMs()).toBe(200);

    // Acota fuera de rango y redondea decimales
    await adapter.saveLatencyMs(999);
    expect(await adapter.getLatencyMs()).toBe(500);
    await adapter.saveLatencyMs(-30);
    expect(await adapter.getLatencyMs()).toBe(0);
    await adapter.saveLatencyMs(174.6);
    expect(await adapter.getLatencyMs()).toBe(175);
  });
});

describe('Selector de adaptador y stub Tauri', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devuelve WebIndexedDBAdapter cuando no existe window.__TAURI_INTERNALS__', () => {
    expect(storageService).toBeInstanceOf(WebIndexedDBAdapter);
    expect(createStorageAdapter({ storage: null })).toBeInstanceOf(WebIndexedDBAdapter);
  });

  it('devuelve TauriRustSqliteAdapter cuando existe window.__TAURI_INTERNALS__ y sus métodos lanzan error no implementado', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });

    const adapter = createStorageAdapter();
    expect(adapter).toBeInstanceOf(TauriRustSqliteAdapter);
    await expect(adapter.init()).rejects.toThrow(/no está implementado/i);
    await expect(adapter.listProjects()).rejects.toThrow(/no está implementado/i);
  });
});
