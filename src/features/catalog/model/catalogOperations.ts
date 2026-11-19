import { migrateProjectJson } from '@/features/export';
import type { IStorageAdapter } from '@/storage';
import type { ProjectFullData, ProjectSummary } from '@/types';
import {
  buildBackupFileName,
  buildSingleProjectBackup,
  createEmptyProject,
  createProjectFromImportedJson,
  createProjectId,
  duplicateProject,
  toSingleProjectAudioData,
} from './catalogModel';

/**
 * Resultado de exportar un respaldo individual en formato JSON.
 */
export interface ProjectBackupExport {
  json: string;
  blob: Blob;
  fileName: string;
}

/**
 * Carga la lista de resúmenes de proyectos desde el adaptador de almacenamiento.
 */
export async function loadCatalogProjects(
  adapter: IStorageAdapter,
): Promise<ProjectSummary[]> {
  await adapter.init();
  return adapter.listProjects();
}

/**
 * Crea un proyecto vacío sin audio y lo persiste en el almacenamiento.
 */
export async function createCatalogProject(
  adapter: IStorageAdapter,
  title: string,
  artist: string,
): Promise<ProjectFullData> {
  await adapter.init();
  const project = createEmptyProject(title, artist);
  await adapter.saveProject(project);
  return project;
}

/**
 * Duplica un proyecto existente junto con su binario de audio si está presente.
 */
export async function duplicateCatalogProject(
  adapter: IStorageAdapter,
  projectId: string,
  newId: string = createProjectId(),
  now: number = Date.now(),
): Promise<ProjectFullData> {
  await adapter.init();
  const original = await adapter.getProject(projectId);
  if (!original) {
    throw new Error('No se encontró la transcripción que intentas duplicar.');
  }

  const duplicated = duplicateProject(original, newId, now);
  await adapter.saveProject(duplicated);

  const audio = await adapter.getAudioBinary(projectId);
  if (audio) {
    await adapter.saveAudioBinary(
      duplicated.id,
      audio.blob,
      audio.fileName,
      audio.peaks,
      audio.duration,
    );
  }

  return duplicated;
}

/**
 * Elimina un proyecto y su audio asociado del almacenamiento.
 */
export async function deleteCatalogProject(
  adapter: IStorageAdapter,
  projectId: string,
): Promise<void> {
  await adapter.init();
  await adapter.deleteProject(projectId);
}

/**
 * Exporta un único proyecto y su audio (si existe) en un respaldo JSON compatible con `CatalogBackup`.
 */
export async function exportCatalogProjectBackup(
  adapter: IStorageAdapter,
  projectId: string,
  exportedAt: number = Date.now(),
): Promise<ProjectBackupExport> {
  await adapter.init();
  const project = await adapter.getProject(projectId);
  if (!project) {
    throw new Error('No se encontró la transcripción para exportar.');
  }

  const audio = await adapter.getAudioBinary(projectId);
  const audioData = audio ? await toSingleProjectAudioData(audio) : null;
  const json = buildSingleProjectBackup(project, audioData, exportedAt);
  const blob = new Blob([json], { type: 'application/json' });
  const fileName = buildBackupFileName(project.title);

  return { json, blob, fileName };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Importa un respaldo de catálogo (`CatalogBackup`) o un proyecto JSON individual de LyricSync.
 * Si es un proyecto JSON individual, migra su esquema y crea un nuevo proyecto sin audio.
 */
export async function importCatalogBackupFromJson(
  adapter: IStorageAdapter,
  jsonString: string,
): Promise<void> {
  if (typeof jsonString !== 'string' || jsonString.trim().length === 0) {
    throw new Error('El archivo JSON está vacío.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('El archivo no contiene un JSON válido.');
  }

  if (!isRecord(parsed)) {
    throw new Error(
      'El archivo JSON no tiene un formato válido: se esperaba un respaldo de catálogo o un proyecto JSON de LyricSync.',
    );
  }

  if (Array.isArray(parsed.projects)) {
    await adapter.init();
    await adapter.importCatalogBackup(jsonString);
    return;
  }

  if (Array.isArray(parsed.lines)) {
    const migrated = migrateProjectJson(parsed);
    if (!migrated.ok) {
      throw new Error(migrated.error);
    }
    const project = createProjectFromImportedJson(migrated.data);
    await adapter.init();
    await adapter.saveProject(project);
    return;
  }

  throw new Error(
    'Formato JSON no reconocido: se esperaba un respaldo de catálogo o un proyecto JSON de LyricSync.',
  );
}
