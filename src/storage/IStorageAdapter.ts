import type {
  AudioBinary,
  ProjectFullData,
  ProjectSummary,
  SessionState,
} from '@/types';

/**
 * Contrato de almacenamiento local-first para LyricSync Studio.
 * Permite intercambiar el motor de persistencia (IndexedDB en web o SQLite/disco en Tauri)
 * sin acoplar la lógica de negocio ni los componentes de interfaz.
 */
export interface IStorageAdapter {
  /**
   * Inicializa la base de datos o almacenamiento subyacente.
   */
  init(): Promise<void>;

  /**
   * Lista los resúmenes de todos los proyectos guardados.
   * No carga los blobs de audio ni las líneas completas para mantener el catálogo ligero.
   */
  listProjects(): Promise<ProjectSummary[]>;

  /**
   * Obtiene los datos completos de un proyecto por su identificador, o `null` si no existe.
   */
  getProject(projectId: string): Promise<ProjectFullData | null>;

  /**
   * Guarda o actualiza los datos completos de un proyecto (metadatos, líneas y ajustes).
   */
  saveProject(project: ProjectFullData): Promise<void>;

  /**
   * Almacena el binario de audio, sus picos de onda y duración asociados a un proyecto.
   */
  saveAudioBinary(
    projectId: string,
    fileBlobOrBuffer: Blob | ArrayBuffer,
    fileName: string,
    peaks: number[],
    duration: number,
  ): Promise<void>;

  /**
   * Recupera el binario de audio y sus metadatos acústicos de un proyecto, o `null` si no existe.
   */
  getAudioBinary(projectId: string): Promise<AudioBinary | null>;

  /**
   * Elimina un proyecto y su binario de audio asociado.
   */
  deleteProject(projectId: string): Promise<void>;

  /**
   * Recupera el último estado de sesión guardado, o `null` si no hay sesión previa.
   */
  getSessionState(): Promise<SessionState | null>;

  /**
   * Persiste el estado actual de la sesión para restaurarlo tras recargar.
   */
  saveSessionState(state: SessionState): Promise<void>;

  /**
   * Exporta todo el catálogo (proyectos y audios en base64) como una cadena JSON serializada.
   */
  exportFullCatalogBackup(): Promise<string>;

  /**
   * Importa un respaldo del catálogo desde una cadena JSON.
   * Valida el formato y la versión del esquema antes de persistir los datos.
   */
  importCatalogBackup(jsonString: string): Promise<void>;
}
