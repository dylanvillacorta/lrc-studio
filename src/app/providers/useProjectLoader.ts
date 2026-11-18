import { useCallback } from 'react';
import { createEmptyProject } from '@/features/catalog';
import { createAudioObjectUrl } from '@/features/session';
import { importAudioFile, type AudioFileInput } from '@/lib/audioImport';
import type { IStorageAdapter } from '@/storage';
import type { ProjectFullData } from '@/types';
import type { CreateProjectInput } from './activeProjectContext';

export interface UseProjectLoaderParams {
  adapter: IStorageAdapter;
  project: ProjectFullData | null;
  flushAutosave: () => Promise<void>;
  applyLoadedProject: (
    nextProject: ProjectFullData,
    nextUrl: string | null,
    peaks: number[],
    duration: number,
  ) => void;
  onAudioAttached: (
    nextUrl: string | null,
    fileName: string,
    peaks: number[],
    duration: number,
  ) => void;
}

/**
 * Encapsula las operaciones asíncronas de carga, creación y adjunción de audio del proyecto activo.
 */
export function useProjectLoader({
  adapter,
  project,
  flushAutosave,
  applyLoadedProject,
  onAudioAttached,
}: UseProjectLoaderParams) {
  const openProject = useCallback(
    async (projectId: string): Promise<void> => {
      await flushAutosave();
      const [loadedProject, loadedAudio] = await Promise.all([
        adapter.getProject(projectId),
        adapter.getAudioBinary(projectId),
      ]);

      if (!loadedProject) {
        throw new Error('No se encontró el proyecto solicitado.');
      }

      const nextUrl = loadedAudio
        ? createAudioObjectUrl(loadedAudio.blob, loadedAudio.fileName)
        : null;
      const peaks = loadedAudio?.peaks.length
        ? loadedAudio.peaks
        : loadedProject.waveformPeaks;
      const duration = loadedAudio?.duration ?? loadedProject.durationMs / 1000;

      applyLoadedProject(loadedProject, nextUrl, peaks, duration);
    },
    [adapter, applyLoadedProject, flushAutosave],
  );

  const createProject = useCallback(
    async (input: CreateProjectInput = {}): Promise<ProjectFullData> => {
      await flushAutosave();
      const nextProject = createEmptyProject(
        input.title ?? 'Sin título',
        input.artist ?? '',
      );
      await adapter.saveProject(nextProject);
      applyLoadedProject(nextProject, null, [], 0);
      return nextProject;
    },
    [adapter, applyLoadedProject, flushAutosave],
  );

  const attachAudio = useCallback(
    async (file: AudioFileInput): Promise<void> => {
      if (!project) {
        throw new Error('No hay un proyecto activo para adjuntar el audio.');
      }

      const imported = await importAudioFile(file);
      await adapter.saveAudioBinary(
        project.id,
        imported.blob,
        imported.fileName,
        imported.peaks,
        imported.duration,
      );

      const nextUrl = createAudioObjectUrl(imported.blob, imported.fileName);
      onAudioAttached(
        nextUrl,
        imported.fileName,
        imported.peaks,
        imported.duration,
      );
    },
    [adapter, onAudioAttached, project],
  );

  return { openProject, createProject, attachAudio };
}
