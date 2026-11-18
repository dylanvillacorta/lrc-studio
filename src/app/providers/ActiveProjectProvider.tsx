import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActiveProjectContext,
  registerActiveFlushHandler,
  type ActiveProjectContextValue,
} from '@/app/providers/activeProjectContext';
import { useStorage } from '@/app/providers/StorageProvider';
import { useObjectUrlState } from '@/app/providers/useObjectUrlState';
import { useProjectLoader } from '@/app/providers/useProjectLoader';
import {
  buildSessionState,
  useAutosave,
  useSessionRestore,
  type AutosaveSnapshot,
} from '@/features/session';
import {
  computeSyncProgress,
  useAudioPlayer,
  useSyncEngine,
} from '@/features/sync';
import type { ActiveTab, LyricLine, ProjectFullData } from '@/types';

export interface ActiveProjectProviderProps {
  children: ReactNode;
}

/**
 * Compone restauración de sesión, motor de sincronización, reproductor de audio
 * y autoguardado con debounce/flush para el proyecto activo.
 */
export function ActiveProjectProvider({ children }: ActiveProjectProviderProps) {
  const adapter = useStorage();
  const restore = useSessionRestore(adapter);

  const [project, setProject] = useState<ProjectFullData | null>(null);
  const [activeTab, setActiveTabState] = useState<ActiveTab>('sync');
  const [hasManualOverride, setHasManualOverride] = useState(false);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [audioDuration, setAudioDuration] = useState(0);

  const { audioUrl: manualAudioUrl, replaceAudioUrl: replaceManualAudioUrl } =
    useObjectUrlState();
  const scheduleSaveRef = useRef<() => void>(() => {});
  const hydratedPlanRef = useRef(false);

  const effectiveAudioUrl = hasManualOverride
    ? manualAudioUrl
    : restore.audioUrl;

  const player = useAudioPlayer({
    src: effectiveAudioUrl,
    initialDurationMs: project?.durationMs ?? 0,
    initialPlaybackRate: project?.settings.playbackRate ?? 1,
  });

  const handleLinesChange = useCallback((nextLines: LyricLine[]) => {
    const progress = computeSyncProgress(nextLines);
    setProject((prev) =>
      prev
        ? {
            ...prev,
            lines: nextLines,
            ...progress,
            updatedAt: Date.now(),
          }
        : null,
    );
    scheduleSaveRef.current();
  }, []);

  const sync = useSyncEngine({ onChange: handleLinesChange });
  const {
    replaceLines,
    setActiveLineIndex,
    setActiveWordIndex,
    resetHistory,
    activeLineIndex,
    activeWordIndex,
  } = sync;
  const { seekTo, setPlaybackRate } = player;

  const getSnapshot = useCallback((): AutosaveSnapshot => {
    return {
      project,
      session: buildSessionState({
        projectId: project?.id ?? null,
        activeTab,
        currentTime: player.currentTime,
        activeLineIndex,
        activeWordIndex,
      }),
    };
  }, [
    activeLineIndex,
    activeTab,
    activeWordIndex,
    player.currentTime,
    project,
  ]);

  const autosave = useAutosave(adapter, getSnapshot, {
    isPlaying: player.isPlaying,
    currentTime: player.currentTime,
  });

  useEffect(() => {
    scheduleSaveRef.current = autosave.scheduleSave;
  }, [autosave.scheduleSave]);

  useEffect(() => {
    return registerActiveFlushHandler(autosave.flush);
  }, [autosave.flush]);

  // Hidrata el proyecto y los índices restaurados una sola vez al completar el arranque.
  useEffect(() => {
    if (
      restore.status !== 'ready' ||
      !restore.plan ||
      hydratedPlanRef.current ||
      hasManualOverride
    ) {
      return;
    }

    hydratedPlanRef.current = true;
    const plan = restore.plan;

    const timer = setTimeout(() => {
      setProject(plan.project);
      setActiveTabState(plan.activeTab);
      setWaveformPeaks(plan.peaks);
      setAudioDuration(plan.duration);
      replaceLines(plan.project.lines, false);
      setActiveLineIndex(plan.activeLineIndex);
      setActiveWordIndex(plan.activeWordIndex);
      resetHistory();
      setPlaybackRate(plan.project.settings.playbackRate);
      seekTo(plan.currentTime);
    }, 0);

    return () => clearTimeout(timer);
  }, [
    hasManualOverride,
    replaceLines,
    resetHistory,
    restore.plan,
    restore.status,
    seekTo,
    setActiveLineIndex,
    setActiveWordIndex,
    setPlaybackRate,
  ]);

  const setActiveTab = useCallback((tab: ActiveTab) => {
    setActiveTabState(tab);
    scheduleSaveRef.current();
  }, []);

  const applyLoadedProject = useCallback(
    (
      nextProject: ProjectFullData,
      nextUrl: string | null,
      peaks: number[],
      duration: number,
    ) => {
      setHasManualOverride(true);
      replaceManualAudioUrl(nextUrl);
      setProject(nextProject);
      setWaveformPeaks(peaks);
      setAudioDuration(duration);
      replaceLines(nextProject.lines, false);
      setActiveLineIndex(0);
      setActiveWordIndex(0);
      resetHistory();
      setPlaybackRate(nextProject.settings.playbackRate);
      seekTo(0);
      scheduleSaveRef.current();
    },
    [
      replaceLines,
      replaceManualAudioUrl,
      resetHistory,
      seekTo,
      setActiveLineIndex,
      setActiveWordIndex,
      setPlaybackRate,
    ],
  );

  const onAudioAttached = useCallback(
    (nextUrl: string | null, fileName: string, peaks: number[], duration: number) => {
      setHasManualOverride(true);
      replaceManualAudioUrl(nextUrl);
      setWaveformPeaks(peaks);
      setAudioDuration(duration);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              audioFileName: fileName,
              durationMs: Math.round(duration * 1000),
              waveformPeaks: peaks,
              updatedAt: Date.now(),
            }
          : null,
      );
      scheduleSaveRef.current();
    },
    [replaceManualAudioUrl],
  );

  const { openProject, createProject, attachAudio } = useProjectLoader({
    adapter,
    project,
    flushAutosave: autosave.flush,
    applyLoadedProject,
    onAudioAttached,
  });

  const updateProjectMetadata = useCallback(
    (
      patch: Partial<Pick<ProjectFullData, 'title' | 'artist' | 'settings'>>,
    ) => {
      setProject((prev) =>
        prev
          ? {
              ...prev,
              ...patch,
              settings: patch.settings
                ? { ...patch.settings }
                : prev.settings,
              updatedAt: Date.now(),
            }
          : null,
      );
      scheduleSaveRef.current();
    },
    [],
  );

  const value = useMemo<ActiveProjectContextValue>(
    () => ({
      project,
      restoreStatus: restore.status,
      restoreError: restore.error,
      activeTab,
      setActiveTab,
      audioUrl: effectiveAudioUrl,
      waveformPeaks,
      audioDuration,
      saveStatus: autosave.saveStatus,
      autosaveState: autosave.autosaveState,
      sync,
      player,
      openProject,
      createProject,
      attachAudio,
      updateProjectMetadata,
      flushPendingSave: autosave.flush,
    }),
    [
      activeTab,
      attachAudio,
      audioDuration,
      autosave.autosaveState,
      autosave.flush,
      autosave.saveStatus,
      createProject,
      effectiveAudioUrl,
      openProject,
      player,
      project,
      restore.error,
      restore.status,
      setActiveTab,
      sync,
      updateProjectMetadata,
      waveformPeaks,
    ],
  );

  return (
    <ActiveProjectContext.Provider value={value}>
      {children}
    </ActiveProjectContext.Provider>
  );
}
