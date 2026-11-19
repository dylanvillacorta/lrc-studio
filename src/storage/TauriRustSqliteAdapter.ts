import type {
  AudioBinary,
  ProjectFullData,
  ProjectSummary,
  SessionState,
} from '@/types';
import type { IStorageAdapter } from './IStorageAdapter';

// Importación futura cuando se empaquete con Tauri v2:
// import { invoke } from '@tauri-apps/api/core';

function notImplemented(methodName: string): Error {
  return new Error(
    `TauriRustSqliteAdapter.${methodName} no está implementado todavía (pendiente de backend Rust en Tauri v2).`,
  );
}

/**
 * Stub de almacenamiento para escritorio con Tauri v2 (SQLite + sistema de archivos local).
 *
 * Estrategia de transferencia de binarios:
 * - Los archivos de audio no se guardan como BLOBs grandes dentro de SQLite.
 * - Al importar o grabar un audio, Rust escribe el binario en disco dentro de la carpeta
 *   elegida por el usuario en Windows (p. ej. mediante `@tauri-apps/plugin-dialog` o `appDataDir`)
 *   y almacena únicamente la ruta absoluta/relativa del archivo junto con sus metadatos
 *   (`fileName`, `mimeType`, `peaks`, `duration`) en la tabla `audio_files` de SQLite.
 * - Para lectura en el WebView, `get_audio_from_disk` devolverá los bytes o una URL de protocolo
 *   de Tauri (`asset://`) junto con los metadatos acústicos.
 */
export class TauriRustSqliteAdapter implements IStorageAdapter {
  /**
   * Inicializa la base de datos SQLite y verifica la carpeta de trabajo en disco.
   * Comando futuro: `invoke('init_sqlite')`
   */
  async init(): Promise<void> {
    throw notImplemented('init');
  }

  /**
   * Lista los resúmenes ligeros de todos los proyectos desde SQLite.
   * Comando futuro: `invoke('list_projects_sqlite')`
   */
  async listProjects(): Promise<ProjectSummary[]> {
    throw notImplemented('listProjects');
  }

  /**
   * Obtiene los datos completos de un proyecto desde SQLite.
   * Comando futuro: `invoke('get_project_sqlite', { projectId })`
   */
  async getProject(projectId: string): Promise<ProjectFullData | null> {
    void projectId;
    throw notImplemented('getProject');
  }

  /**
   * Guarda o actualiza un proyecto y su resumen en SQLite dentro de una transacción.
   * Comando futuro: `invoke('save_project_sqlite', { project })`
   */
  async saveProject(project: ProjectFullData): Promise<void> {
    void project;
    throw notImplemented('saveProject');
  }

  /**
   * Escribe el binario de audio en la carpeta elegida por el usuario en Windows y registra
   * su ruta y metadatos (`peaks`, `duration`, `mimeType`) en SQLite.
   * Comando futuro: `invoke('save_audio_to_disk', { projectId, bytes, fileName, mimeType, peaks, duration })`
   */
  async saveAudioBinary(
    projectId: string,
    fileBlobOrBuffer: Blob | ArrayBuffer,
    fileName: string,
    peaks: number[],
    duration: number,
  ): Promise<void> {
    void projectId;
    void fileBlobOrBuffer;
    void fileName;
    void peaks;
    void duration;
    throw notImplemented('saveAudioBinary');
  }

  /**
   * Lee el archivo de audio desde disco usando la ruta registrada en SQLite y reconstruye el `AudioBinary`.
   * Comando futuro: `invoke('get_audio_from_disk', { projectId })`
   */
  async getAudioBinary(projectId: string): Promise<AudioBinary | null> {
    void projectId;
    throw notImplemented('getAudioBinary');
  }

  /**
   * Elimina el proyecto en SQLite y borra su archivo de audio asociado en disco.
   * Comando futuro: `invoke('delete_project_sqlite', { projectId })`
   */
  async deleteProject(projectId: string): Promise<void> {
    void projectId;
    throw notImplemented('deleteProject');
  }

  /**
   * Recupera el último estado de sesión persistido en SQLite.
   * Comando futuro: `invoke('get_session_state_sqlite')`
   */
  async getSessionState(): Promise<SessionState | null> {
    throw notImplemented('getSessionState');
  }

  /**
   * Persiste el estado actual de la sesión en SQLite.
   * Comando futuro: `invoke('save_session_state_sqlite', { state })`
   */
  async saveSessionState(state: SessionState): Promise<void> {
    void state;
    throw notImplemented('saveSessionState');
  }

  /**
   * Recupera la compensación de latencia de salida de audio en ms desde SQLite.
   * Comando futuro: `invoke('get_latency_ms_sqlite')`
   */
  async getLatencyMs(): Promise<number> {
    throw notImplemented('getLatencyMs');
  }

  /**
   * Persiste la compensación de latencia de salida de audio en ms en SQLite.
   * Comando futuro: `invoke('save_latency_ms_sqlite', { latencyMs })`
   */
  async saveLatencyMs(latencyMs: number): Promise<void> {
    void latencyMs;
    throw notImplemented('saveLatencyMs');
  }

  /**
   * Exporta el catálogo completo desde SQLite y los audios en disco codificados en Base64.
   * Comando futuro: `invoke('export_catalog_backup_sqlite')`
   */
  async exportFullCatalogBackup(): Promise<string> {
    throw notImplemented('exportFullCatalogBackup');
  }

  /**
   * Importa un respaldo JSON en SQLite y restaura los binarios de audio en la carpeta local.
   * Comando futuro: `invoke('import_catalog_backup_sqlite', { jsonString })`
   */
  async importCatalogBackup(jsonString: string): Promise<void> {
    void jsonString;
    throw notImplemented('importCatalogBackup');
  }
}
