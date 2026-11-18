import { arrayBufferToBase64, base64ToArrayBuffer } from '@/lib/base64';
import {
  BACKUP_SCHEMA_VERSION,
  type ActiveTab,
  type AudioBinary,
  type CatalogBackup,
  type ProjectFullData,
  type ProjectSummary,
  type SerializedAudioBackup,
  type SessionState,
} from '@/types';
import type { IStorageAdapter } from './IStorageAdapter';

const DEFAULT_DB_NAME = 'lyricsync-studio';
const DB_VERSION = 1;

const STORE_PROJECTS = 'projects';
const STORE_SUMMARIES = 'summaries';
const STORE_AUDIO = 'audio';
const STORE_META = 'meta';

const META_SESSION_KEY = 'session';
const LOCAL_STORAGE_SESSION_KEY = 'lyricsync:session';

const VALID_TABS: ReadonlySet<string> = new Set<ActiveTab>([
  'sync',
  'word',
  'lyrics',
  'loupe',
  'export',
  'catalog',
]);

interface AudioStoredRecord {
  projectId: string;
  buffer: ArrayBuffer;
  mime: string;
  fileName: string;
  peaks: number[];
  duration: number;
}

interface DecodedAudioEntry {
  record: AudioStoredRecord;
}

/**
 * Interfaz mínima compatible con `window.localStorage` para permitir inyección en pruebas.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Opciones de configuración para `WebIndexedDBAdapter`.
 */
export interface WebIndexedDBAdapterOptions {
  /** Implementación de almacenamiento síncrono (por defecto `globalThis.localStorage` si existe). */
  storage?: StorageLike | null;
  /** Nombre de la base de datos IndexedDB (por defecto `lyricsync-studio`). */
  dbName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toProjectSummary(project: ProjectFullData): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    artist: project.artist,
    audioFileName: project.audioFileName,
    durationMs: project.durationMs,
    totalLines: project.totalLines,
    syncedLines: project.syncedLines,
    totalWords: project.totalWords,
    syncedWords: project.syncedWords,
    lineProgress: project.lineProgress,
    wordProgress: project.wordProgress,
    updatedAt: project.updatedAt,
  };
}

function inferMimeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return 'application/octet-stream';
}

function isValidSessionState(value: unknown): value is SessionState {
  if (!isRecord(value)) return false;
  return (
    (value.projectId === null || typeof value.projectId === 'string') &&
    typeof value.activeTab === 'string' &&
    VALID_TABS.has(value.activeTab) &&
    typeof value.currentTime === 'number' &&
    typeof value.activeLineIndex === 'number' &&
    typeof value.activeWordIndex === 'number' &&
    typeof value.updatedAt === 'number'
  );
}

function validateBackupProject(item: unknown, index: number): ProjectFullData {
  if (!isRecord(item)) {
    throw new Error(`El proyecto en la posición ${index} del respaldo no es un objeto válido.`);
  }
  if (typeof item.id !== 'string' || item.id.length === 0) {
    throw new Error(`El proyecto en la posición ${index} del respaldo no tiene un id válido.`);
  }
  if (typeof item.title !== 'string' || typeof item.artist !== 'string') {
    throw new Error(`El proyecto "${item.id}" del respaldo tiene metadatos inválidos.`);
  }
  if (!Array.isArray(item.lines) || !Array.isArray(item.waveformPeaks)) {
    throw new Error(`El proyecto "${item.id}" del respaldo no contiene líneas o picos de onda válidos.`);
  }
  if (typeof item.updatedAt !== 'number' || typeof item.createdAt !== 'number') {
    throw new Error(`El proyecto "${item.id}" del respaldo no tiene marcas de tiempo válidas.`);
  }
  return item as unknown as ProjectFullData;
}

function validateBackupAudio(item: unknown, index: number): SerializedAudioBackup {
  if (!isRecord(item)) {
    throw new Error(`El audio en la posición ${index} del respaldo no es un objeto válido.`);
  }
  if (typeof item.projectId !== 'string' || item.projectId.length === 0) {
    throw new Error(`El audio en la posición ${index} del respaldo no tiene un projectId válido.`);
  }
  if (
    typeof item.fileName !== 'string' ||
    typeof item.mimeType !== 'string' ||
    typeof item.base64 !== 'string' ||
    !Array.isArray(item.peaks) ||
    typeof item.duration !== 'number'
  ) {
    throw new Error(`El audio del proyecto "${item.projectId}" en el respaldo tiene campos inválidos.`);
  }
  return item as unknown as SerializedAudioBackup;
}

function parseAndDecodeBackup(jsonString: string): {
  projects: ProjectFullData[];
  audios: DecodedAudioEntry[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('El archivo de respaldo no es un JSON válido.');
  }

  if (!isRecord(parsed)) {
    throw new Error('La estructura del respaldo es inválida: se esperaba un objeto JSON.');
  }

  if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Versión de esquema de respaldo no compatible: se esperaba ${BACKUP_SCHEMA_VERSION}.`,
    );
  }

  if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.audios)) {
    throw new Error('La estructura del respaldo es inválida: faltan las listas de proyectos o audios.');
  }

  const projects = parsed.projects.map((item, idx) => validateBackupProject(item, idx));
  const audios: DecodedAudioEntry[] = parsed.audios.map((item, idx) => {
    const audio = validateBackupAudio(item, idx);
    const buffer = base64ToArrayBuffer(audio.base64);
    return {
      record: {
        projectId: audio.projectId,
        buffer,
        mime: audio.mimeType || inferMimeFromFileName(audio.fileName),
        fileName: audio.fileName,
        peaks: [...audio.peaks],
        duration: audio.duration,
      },
    };
  });

  return { projects, audios };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Error en solicitud de IndexedDB.'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Error en transacción de IndexedDB.'));
    tx.onabort = () => reject(tx.error ?? new Error('Transacción de IndexedDB abortada.'));
  });
}

/**
 * Adaptador de persistencia local-first sobre IndexedDB nativo y puntero ligero en `localStorage`.
 */
export class WebIndexedDBAdapter implements IStorageAdapter {
  private readonly dbName: string;
  private readonly injectedStorage: StorageLike | null | undefined;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options?: WebIndexedDBAdapterOptions) {
    this.dbName = options?.dbName ?? DEFAULT_DB_NAME;
    this.injectedStorage = options?.storage;
  }

  private getLocalStorage(): StorageLike | null {
    if (this.injectedStorage !== undefined) {
      return this.injectedStorage;
    }
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        return globalThis.localStorage ?? null;
      }
    } catch {
      return null;
    }
    return null;
  }

  private async ensureDb(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('No se pudo inicializar la base de datos IndexedDB.');
    }
    return this.db;
  }

  async init(): Promise<void> {
    if (this.db) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB no está disponible en este entorno.'));
        return;
      }

      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_PROJECTS)) {
          database.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(STORE_SUMMARIES)) {
          database.createObjectStore(STORE_SUMMARIES, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(STORE_AUDIO)) {
          database.createObjectStore(STORE_AUDIO, { keyPath: 'projectId' });
        }
        if (!database.objectStoreNames.contains(STORE_META)) {
          database.createObjectStore(STORE_META);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.db.onclose = () => {
          this.db = null;
        };
        resolve();
      };

      request.onerror = () => {
        reject(request.error ?? new Error('Error al abrir IndexedDB.'));
      };
    }).finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const db = await this.ensureDb();
    const tx = db.transaction(STORE_SUMMARIES, 'readonly');
    const summaries = await requestToPromise(
      tx.objectStore(STORE_SUMMARIES).getAll() as IDBRequest<ProjectSummary[]>,
    );
    await transactionDone(tx);
    return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getProject(projectId: string): Promise<ProjectFullData | null> {
    const db = await this.ensureDb();
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const result = await requestToPromise(
      tx.objectStore(STORE_PROJECTS).get(projectId) as IDBRequest<ProjectFullData | undefined>,
    );
    await transactionDone(tx);
    return result ?? null;
  }

  async saveProject(project: ProjectFullData): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction([STORE_PROJECTS, STORE_SUMMARIES], 'readwrite');
    tx.objectStore(STORE_PROJECTS).put(project);
    tx.objectStore(STORE_SUMMARIES).put(toProjectSummary(project));
    await transactionDone(tx);
  }

  async saveAudioBinary(
    projectId: string,
    fileBlobOrBuffer: Blob | ArrayBuffer,
    fileName: string,
    peaks: number[],
    duration: number,
  ): Promise<void> {
    let buffer: ArrayBuffer;
    let mime: string;

    if (fileBlobOrBuffer instanceof ArrayBuffer) {
      buffer = fileBlobOrBuffer;
      mime = inferMimeFromFileName(fileName);
    } else {
      buffer = await fileBlobOrBuffer.arrayBuffer();
      mime = fileBlobOrBuffer.type || inferMimeFromFileName(fileName);
    }

    const db = await this.ensureDb();
    const tx = db.transaction([STORE_AUDIO, STORE_SUMMARIES], 'readwrite');
    const audioRecord: AudioStoredRecord = {
      projectId,
      buffer,
      mime,
      fileName,
      peaks: [...peaks],
      duration,
    };
    tx.objectStore(STORE_AUDIO).put(audioRecord);

    const summaryStore = tx.objectStore(STORE_SUMMARIES);
    const existingSummary = await requestToPromise(
      summaryStore.get(projectId) as IDBRequest<ProjectSummary | undefined>,
    );
    if (existingSummary) {
      summaryStore.put({
        ...existingSummary,
        audioFileName: fileName,
        durationMs:
          existingSummary.durationMs <= 0 && duration > 0
            ? Math.round(duration * 1000)
            : existingSummary.durationMs,
      });
    }

    await transactionDone(tx);
  }

  async getAudioBinary(projectId: string): Promise<AudioBinary | null> {
    const db = await this.ensureDb();
    const tx = db.transaction(STORE_AUDIO, 'readonly');
    const record = await requestToPromise(
      tx.objectStore(STORE_AUDIO).get(projectId) as IDBRequest<AudioStoredRecord | undefined>,
    );
    await transactionDone(tx);

    if (!record) {
      return null;
    }

    const blob = new Blob([record.buffer], {
      type: record.mime || 'application/octet-stream',
    });

    return {
      blob,
      fileName: record.fileName,
      peaks: record.peaks,
      duration: record.duration,
    };
  }

  async deleteProject(projectId: string): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction([STORE_PROJECTS, STORE_SUMMARIES, STORE_AUDIO], 'readwrite');
    tx.objectStore(STORE_PROJECTS).delete(projectId);
    tx.objectStore(STORE_SUMMARIES).delete(projectId);
    tx.objectStore(STORE_AUDIO).delete(projectId);
    await transactionDone(tx);
  }

  async getSessionState(): Promise<SessionState | null> {
    const storage = this.getLocalStorage();
    if (storage) {
      try {
        const raw = storage.getItem(LOCAL_STORAGE_SESSION_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (isValidSessionState(parsed)) {
            return parsed;
          }
        }
      } catch {
        // Si localStorage falla o contiene datos corruptos, cae a IndexedDB.
      }
    }

    const db = await this.ensureDb();
    const tx = db.transaction(STORE_META, 'readonly');
    const stored = await requestToPromise(
      tx.objectStore(STORE_META).get(META_SESSION_KEY) as IDBRequest<SessionState | undefined>,
    );
    await transactionDone(tx);
    return stored ?? null;
  }

  async saveSessionState(state: SessionState): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put(state, META_SESSION_KEY);
    await transactionDone(tx);

    const storage = this.getLocalStorage();
    if (storage) {
      try {
        storage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(state));
      } catch {
        // Ignora fallos de cuota o restricciones de localStorage; IndexedDB ya persistió la sesión.
      }
    }
  }

  async exportFullCatalogBackup(): Promise<string> {
    const db = await this.ensureDb();
    const tx = db.transaction([STORE_PROJECTS, STORE_AUDIO], 'readonly');
    const [projects, audioRecords] = await Promise.all([
      requestToPromise(tx.objectStore(STORE_PROJECTS).getAll() as IDBRequest<ProjectFullData[]>),
      requestToPromise(tx.objectStore(STORE_AUDIO).getAll() as IDBRequest<AudioStoredRecord[]>),
    ]);
    await transactionDone(tx);

    const backup: CatalogBackup = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: Date.now(),
      projects,
      audios: audioRecords.map((record) => ({
        projectId: record.projectId,
        fileName: record.fileName,
        mimeType: record.mime,
        base64: arrayBufferToBase64(record.buffer),
        peaks: record.peaks,
        duration: record.duration,
      })),
    };

    return JSON.stringify(backup);
  }

  async importCatalogBackup(jsonString: string): Promise<void> {
    const { projects, audios } = parseAndDecodeBackup(jsonString);

    const db = await this.ensureDb();
    const tx = db.transaction([STORE_PROJECTS, STORE_SUMMARIES, STORE_AUDIO], 'readwrite');
    const projectStore = tx.objectStore(STORE_PROJECTS);
    const summaryStore = tx.objectStore(STORE_SUMMARIES);
    const audioStore = tx.objectStore(STORE_AUDIO);

    for (const project of projects) {
      projectStore.put(project);
      summaryStore.put(toProjectSummary(project));
    }

    for (const { record } of audios) {
      audioStore.put(record);
    }

    await transactionDone(tx);
  }
}
