import { createEmptyProject } from '@/features/catalog';
import {
  createAudioObjectUrl,
  createPlaybackObjectUrl,
  rememberPlaybackBlob,
  resolveAudioDurationSec,
  revokeAudioObjectUrl,
  type PlaybackUrlResult,
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
  /** Crea la URL de reproducción al abrir un proyecto (MP3/AAC suenan desde un WAV PCM). */
  createPlaybackUrl?: (
    binary: Blob | ArrayBuffer,
    fileName: string | undefined,
    options: { projectId: string },
  ) => Promise<PlaybackUrlResult>;
  /** Registra (o limpia con `null`) el WAV de reproducción del proyecto para reutilizarlo al reparar. */
  rememberPlayback?: (projectId: string, blob: Blob | null) => void;
  /** Aviso no bloqueante de reproducción (o `null` para limpiarlo). */
  onPlaybackWarning?: (message: string | null) => void;
  /** Se invoca con `true`/`false` (emparejados) mientras se decodifica el audio. */
  onPreparingChange?: (preparing: boolean) => void;
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
    createPlaybackUrl = createPlaybackObjectUrl,
    rememberPlayback = rememberPlaybackBlob,
    onPlaybackWarning,
    onPreparingChange,
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

    onPlaybackWarning?.(null);
    let nextUrl: string | null = null;
    let warning: string | null = null;
    if (loadedAudio) {
      onPreparingChange?.(true);
      try {
        const playback = await createPlaybackUrl(
          loadedAudio.blob,
          loadedAudio.fileName,
          { projectId },
        );
        nextUrl = playback.url;
        warning = playback.warning;
      } finally {
        onPreparingChange?.(false);
      }
    }

    if (isStale(opId)) {
      revokeObjectUrl(nextUrl);
      return;
    }
    if (warning) {
      onPlaybackWarning?.(warning);
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

    onPlaybackWarning?.(null);
    onPreparingChange?.(true);
    let imported: ImportedAudioResult;
    try {
      imported = await importAudio(file);
    } finally {
      onPreparingChange?.(false);
    }
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

    // Se guarda el original (arriba); se reproduce el WAV preparado si existe.
    const playbackBlob = imported.playbackBlob ?? null;
    const nextUrl = playbackBlob
      ? createObjectUrl(playbackBlob, 'audio.wav')
      : createObjectUrl(imported.blob, imported.fileName);
    if (isAttachStale()) {
      revokeObjectUrl(nextUrl);
      return;
    }
    rememberPlayback(targetProjectId, playbackBlob);
    if (imported.playbackWarning) {
      onPlaybackWarning?.(imported.playbackWarning);
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
