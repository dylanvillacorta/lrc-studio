import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  createProjectOperations,
  type ProjectOperations,
} from '@/app/providers/projectOperations';
import type { IStorageAdapter } from '@/storage';
import type { ProjectFullData } from '@/types';
import type { CreateProjectInput } from './activeProjectContext';
import type { AudioFileInput } from '@/lib/audioImport';

export interface UseProjectLoaderParams {
  adapter: IStorageAdapter;
  project: ProjectFullData | null;
  flushAutosave: () => Promise<void>;
  pausePlayback?: () => void;
  onPlaybackWarning?: (message: string | null) => void;
  onPreparingChange?: (preparing: boolean) => void;
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

/**
 * Encapsula las operaciones asíncronas de carga, creación y adjunción de audio del proyecto activo.
 */
export function useProjectLoader({
  adapter,
  project,
  flushAutosave,
  pausePlayback,
  onPlaybackWarning,
  onPreparingChange,
  applyLoadedProject,
  onAudioAttached,
}: UseProjectLoaderParams) {
  const warningRef = useRef(onPlaybackWarning);
  const preparingRef = useRef(onPreparingChange);
  const projectRef = useRef<ProjectFullData | null>(project);
  const flushRef = useRef(flushAutosave);
  const pauseRef = useRef(pausePlayback);
  const applyRef = useRef(applyLoadedProject);
  const attachRef = useRef(onAudioAttached);
  const mountedRef = useRef(true);
  const opsRef = useRef<ProjectOperations | null>(null);
  const opsAdapterRef = useRef<IStorageAdapter | null>(null);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    flushRef.current = flushAutosave;
  }, [flushAutosave]);

  useEffect(() => {
    pauseRef.current = pausePlayback;
  }, [pausePlayback]);

  useEffect(() => {
    warningRef.current = onPlaybackWarning;
    preparingRef.current = onPreparingChange;
  }, [onPlaybackWarning, onPreparingChange]);

  useEffect(() => {
    applyRef.current = applyLoadedProject;
  }, [applyLoadedProject]);

  useEffect(() => {
    attachRef.current = onAudioAttached;
  }, [onAudioAttached]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const getOps = useCallback((): ProjectOperations => {
    if (!opsRef.current || opsAdapterRef.current !== adapter) {
      opsAdapterRef.current = adapter;
      opsRef.current = createProjectOperations({
        adapter,
        getActiveProject: () => projectRef.current,
        flushAutosave: () => flushRef.current(),
        pausePlayback: () => pauseRef.current?.(),
        isMounted: () => mountedRef.current,
        onPlaybackWarning: (message) => warningRef.current?.(message),
        onPreparingChange: (preparing) => preparingRef.current?.(preparing),
        applyLoadedProject: (nextProject, nextUrl, peaks, durationSec) => {
          projectRef.current = nextProject;
          applyRef.current(nextProject, nextUrl, peaks, durationSec);
        },
        onAudioAttached: (
          projectId,
          nextUrl,
          fileName,
          peaks,
          durationSec,
        ) => {
          attachRef.current(
            projectId,
            nextUrl,
            fileName,
            peaks,
            durationSec,
          );
        },
      });
    }
    return opsRef.current;
  }, [adapter]);

  const openProject = useCallback(
    (projectId: string) => getOps().openProject(projectId),
    [getOps],
  );

  const createProject = useCallback(
    (input?: CreateProjectInput) => getOps().createProject(input),
    [getOps],
  );

  const attachAudio = useCallback(
    (file: AudioFileInput) => getOps().attachAudio(file),
    [getOps],
  );

  return useMemo(
    () => ({ openProject, createProject, attachAudio }),
    [attachAudio, createProject, openProject],
  );
}
