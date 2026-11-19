import { createEmptyProject } from '@/features/catalog';
import {
  createAudioObjectUrl,
  resolveAudioDurationSec,
  revokeAudioObjectUrl,
} from '@/features/session';
import {
  importAudioFile,
  type AudioFileInput,
  type ImportedAudioResult,
} from '@/lib/audioImport';
import type { IStorageAdapter } from '@/storage';
import type { ProjectFullData } from '@/types';
import type { CreateProjectInput } from './activeProjectContext';

export interface ProjectOperationsDeps {
  adapter: IStorageAdapter;
  getActiveProject: () => ProjectFullData | null;
  flushAutosave: () => Promise<void>;
  pausePlayback?: () => void;
  isMounted?: () => boolean;
  importAudio?: (file: AudioFileInput) => Promise<ImportedAudioResult>;
  createObjectUrl?: (binary: Blob | ArrayBuffer, fileName?: string) => string | null;
  revokeObjectUrl?: (url: string | null) => void;
  applyLoadedProject: (
    nextProject: ProjectFullData,
    nextUrl: string | null,
    peaks: number[],
    /** Duración del audio en segundos. */
    durationSec: number,
  ) => void;
  onAudioAttached: (
    projectId: string,
    nextUrl: string | null,
    fileName: string,
    peaks: number[],
    /** Duración del audio en segundos. */
    durationSec: number,
  ) => void;
}

export interface ProjectOperations {
  openProject: (projectId: string) => Promise<void>;
  createProject: (input?: CreateProjectInput) => Promise<ProjectFullData>;
  attachAudio: (file: AudioFileInput) => Promise<void>;
}

/**
 * Crea las operaciones asíncronas de cambio/creación de proyecto y adjunción de audio
 * con serialización por contador de operación para evitar carreras y fugas de `ObjectURL`.
 */
export function createProjectOperations(
  deps: ProjectOperationsDeps,
): ProjectOperations {
  const {
    adapter,
    getActiveProject,
    flushAutosave,
    pausePlayback,
    isMounted = () => true,
    importAudio = importAudioFile,
    createObjectUrl = createAudioObjectUrl,
    revokeObjectUrl = revokeAudioObjectUrl,
    applyLoadedProject,
    onAudioAttached,
  } = deps;

  let activeOperationId = 0;
  let activeAttachId = 0;

  const isStale = (opId: number): boolean =>
    !isMounted() || activeOperationId !== opId;

  const openProject = async (projectId: string): Promise<void> => {
    const opId = ++activeOperationId;
    activeAttachId += 1;
    pausePlayback?.();
    await flushAutosave();
    if (isStale(opId)) {
      return;
    }

    const [loadedProject, loadedAudio] = await Promise.all([
      adapter.getProject(projectId),
      adapter.getAudioBinary(projectId),
    ]);
    if (isStale(opId)) {
      return;
    }

    if (!loadedProject) {
      throw new Error('No se encontró el proyecto solicitado.');
    }

    const nextUrl = loadedAudio
      ? createObjectUrl(loadedAudio.blob, loadedAudio.fileName)
      : null;

    if (isStale(opId)) {
      revokeObjectUrl(nextUrl);
      return;
    }

    const peaks =
      loadedAudio && loadedAudio.peaks.length > 0
        ? loadedAudio.peaks
        : loadedProject.waveformPeaks;
    const durationSec = resolveAudioDurationSec(
      loadedAudio,
      loadedProject.durationMs,
    );

    applyLoadedProject(loadedProject, nextUrl, peaks, durationSec);
  };

  const createProject = async (
    input: CreateProjectInput = {},
  ): Promise<ProjectFullData> => {
    const opId = ++activeOperationId;
    activeAttachId += 1;
    pausePlayback?.();
    await flushAutosave();

    const nextProject = createEmptyProject(
      input.title ?? 'Sin título',
      input.artist ?? '',
    );
    await adapter.saveProject(nextProject);

    if (!isStale(opId)) {
      applyLoadedProject(nextProject, null, [], 0);
    }
    return nextProject;
  };

  const attachAudio = async (file: AudioFileInput): Promise<void> => {
    const currentProject = getActiveProject();
    if (!currentProject) {
      throw new Error('No hay un proyecto activo para adjuntar el audio.');
    }

    const targetProjectId = currentProject.id;
    const capturedOpId = activeOperationId;
    const attachId = ++activeAttachId;

    const isAttachStale = (): boolean =>
      isStale(capturedOpId) ||
      activeAttachId !== attachId ||
      getActiveProject()?.id !== targetProjectId;

    const imported = await importAudio(file);
    if (isAttachStale()) {
      return;
    }

    await adapter.saveAudioBinary(
      targetProjectId,
      imported.blob,
      imported.fileName,
      imported.peaks,
      imported.duration,
    );
    if (isAttachStale()) {
      return;
    }

    const nextUrl = createObjectUrl(imported.blob, imported.fileName);
    if (isAttachStale()) {
      revokeObjectUrl(nextUrl);
      return;
    }

    onAudioAttached(
      targetProjectId,
      nextUrl,
      imported.fileName,
      imported.peaks,
      imported.duration,
    );
  };

  return { openProject, createProject, attachAudio };
}
