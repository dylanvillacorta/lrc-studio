import type { IStorageAdapter } from '@/storage';
import type { ProjectFullData, ProjectSummary } from '@/types';
import {
  buildBackupFileName,
  buildSingleProjectBackup,
  createEmptyProject,
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
