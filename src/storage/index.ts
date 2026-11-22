import type { IStorageAdapter } from './IStorageAdapter';
import { TauriRustSqliteAdapter } from './TauriRustSqliteAdapter';
import {
  WebIndexedDBAdapter,
  type StorageLike,
  type WebIndexedDBAdapterOptions,
} from './WebIndexedDBAdapter';

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Crea una instancia del adaptador de almacenamiento según el entorno de ejecución:
 * `TauriRustSqliteAdapter` si existe `window.__TAURI_INTERNALS__`, o `WebIndexedDBAdapter` en navegador/Node.
 */
export function createStorageAdapter(
  options?: WebIndexedDBAdapterOptions,
): IStorageAdapter {
  if (isTauriEnvironment()) {
    return new TauriRustSqliteAdapter();
  }
  return new WebIndexedDBAdapter(options);
}

/**
 * Instancia única compartida del servicio de almacenamiento local-first.
 */
export const storageService: IStorageAdapter = createStorageAdapter();

export {
  KNOWN_STORED_PROJECT_SCHEMA_VERSIONS,
  UnrestorableProjectError,
  migrateStoredProject,
} from './storedProjectMigrations';
export { migrateBackupJson } from './backupMigrations';

export {
  TauriRustSqliteAdapter,
  WebIndexedDBAdapter,
  type IStorageAdapter,
  type StorageLike,
  type WebIndexedDBAdapterOptions,
};
