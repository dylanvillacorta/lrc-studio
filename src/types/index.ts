/**
 * Pestañas principales de la aplicación LRC Studio.
 */
export type ActiveTab = 'sync' | 'word' | 'lyrics' | 'loupe' | 'export' | 'catalog';

/**
 * Marca temporal individual de una palabra dentro de una línea.
 */
export interface WordTiming {
  id: string;
  text: string;
  startMs: number | null;
  endMs: number | null;
}

/**
 * Línea de letra con sus marcas temporales y desglose por palabras.
 */
export interface LyricLine {
  id: string;
  text: string;
  startMs: number | null;
  endMs: number | null;
  words: WordTiming[];
}

/**
 * Ajustes de reproducción y sincronización propios de un proyecto.
 */
export interface ProjectSettings {
  playbackRate: number;
  preRollSeconds: number;
  autoAdvance: boolean;
}

/**
 * Resumen ligero de un proyecto para el catálogo «Mis Transcripciones».
 * No incluye el binario de audio ni las líneas completas.
 */
export interface ProjectSummary {
  id: string;
  title: string;
  artist: string;
  audioFileName: string;
  durationMs: number;
  totalLines: number;
  syncedLines: number;
  totalWords: number;
  syncedWords: number;
  /** Porcentaje de líneas sincronizadas (0-100). */
  lineProgress: number;
  /** Porcentaje de palabras sincronizadas (0-100). */
  wordProgress: number;
  updatedAt: number;
}

/**
 * Datos completos de un proyecto, incluyendo letras, picos de onda y ajustes.
 */
export interface ProjectFullData extends ProjectSummary {
  /** Versión de esquema del registro guardado (ausente = 1). Ver `STORED_PROJECT_SCHEMA_VERSION`. */
  schemaVersion?: number;
  lines: LyricLine[];
  waveformPeaks: number[];
  settings: ProjectSettings;
  createdAt: number;
}

/**
 * Binario de audio y metadatos acústicos asociados a un proyecto.
 */
export interface AudioBinary {
  blob: Blob | ArrayBuffer;
  fileName: string;
  peaks: number[];
  duration: number;
}

/**
 * Estado de la sesión activa para restauración tras recarga.
 */
export interface SessionState {
  projectId: string | null;
  activeTab: ActiveTab;
  currentTime: number;
  activeLineIndex: number;
  activeWordIndex: number;
  updatedAt: number;
}

/**
 * Versión actual del esquema del proyecto guardado en IndexedDB.
 */
export const STORED_PROJECT_SCHEMA_VERSION = 2 as const;

/**
 * Causa por la que un proyecto guardado no se puede restaurar.
 */
export type UnrestorableCode = 'malformed' | 'future' | 'unknown' | 'migration-failed';

/**
 * Registro guardado que no se pudo migrar o validar. El original se conserva intacto.
 */
export interface UnrestorableProject {
  id: string;
  title: string | null;
  code: UnrestorableCode;
  reason: string;
}

/**
 * Versión actual del esquema de respaldo JSON del catálogo.
 */
export const BACKUP_SCHEMA_VERSION = 1 as const;

/**
 * Audio serializado en base64 para exportación e importación de respaldos.
 */
export interface SerializedAudioBackup {
  projectId: string;
  fileName: string;
  mimeType: string;
  base64: string;
  peaks: number[];
  duration: number;
}

/**
 * Formato del archivo de respaldo completo del catálogo en JSON.
 */
export interface CatalogBackup {
  schemaVersion: number;
  exportedAt: number;
  projects: ProjectFullData[];
  audios: SerializedAudioBackup[];
}

/**
 * Formatos soportados de exportación de letras sincronizadas.
 */
export type ExportFormat = 'json' | 'elrc' | 'lrc';

/**
 * Unidad temporal utilizada en la exportación JSON.
 */
export type JsonTimeUnit = 'seconds' | 'ms';

/**
 * Metadatos editoriales de la canción para encabezados de exportación.
 */
export interface SongMetadata {
  title: string;
  artist: string;
  album: string;
  offsetMs: number;
}

/**
 * Estado del semáforo de cuenta regresiva del Pre-Roll.
 */
export type PreRollTrafficLight = 'red' | 'amber' | 'green';

/**
 * Ventana temporal de reproducción de «Escuchar línea» en la lupa, con Pre-Roll y Post-Roll (en milisegundos).
 */
export interface ActiveLineWindow {
  lineStartMs: number;
  lineEndMs: number;
  windowStartMs: number;
  windowEndMs: number;
}

/**
 * Métricas de progreso de sincronización de líneas y palabras.
 */
export interface SyncProgress {
  totalLines: number;
  syncedLines: number;
  totalWords: number;
  syncedWords: number;
  /** Porcentaje de líneas sincronizadas (0-100). */
  lineProgress: number;
  /** Porcentaje de palabras sincronizadas (0-100). */
  wordProgress: number;
}
