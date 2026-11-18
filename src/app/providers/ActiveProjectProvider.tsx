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
import {
  applyAttachedAudioToProject,
  applyLinesToProject,
  applyMetadataToProject,
} from '@/app/providers/projectMutations';
import { useStorage } from '@/app/providers/StorageProvider';
import { useObjectUrlState } from '@/app/providers/useObjectUrlState';
import { useProjectLoader } from '@/app/providers/useProjectLoader';
import { useRestoreHydration } from '@/app/providers/useRestoreHydration';
import {
  buildSessionState,
  useAutosave,
  useSessionRestore,
  type AutosaveSnapshot,
  type RestorePlan,
} from '@/features/session';
import { useAudioPlayer, useSyncEngine } from '@/features/sync';
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
  const { clearAudioUrl: clearRestoreAudioUrl } = restore;

  const [project, setProject] = useState<ProjectFullData | null>(null);
  const [activeTab, setActiveTabState] = useState<ActiveTab>('sync');
  const [hasManualOverride, setHasManualOverride] = useState(false);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [audioDuration, setAudioDuration] = useState(0);

  const { audioUrl: manualAudioUrl, replaceAudioUrl: replaceManualAudioUrl } =
    useObjectUrlState();
  const projectRef = useRef<ProjectFullData | null>(null);
  const activeTabRef = useRef<ActiveTab>('sync');
  const suppressLineChangeRef = useRef(false);
  const skipNextAutoScheduleRef = useRef(false);

  const effectiveAudioUrl = hasManualOverride
    ? manualAudioUrl
    : restore.audioUrl;

  const player = useAudioPlayer({
    src: effectiveAudioUrl,
    initialDurationMs: project?.durationMs ?? 0,
    initialPlaybackRate: project?.settings.playbackRate ?? 1,
  });

  const handleLinesChange = useCallback((nextLines: LyricLine[]) => {
    if (suppressLineChangeRef.current || !projectRef.current) {
      return;
    }
    const updated = applyLinesToProject(projectRef.current, nextLines);
    projectRef.current = updated;
    setProject(updated);
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
  const { pause, seekTo, setPlaybackRate } = player;

  const getSnapshot = useCallback((): AutosaveSnapshot => {
    const activeProject = projectRef.current;
    return {
      project: activeProject,
      session: buildSessionState({
        projectId: activeProject?.id ?? null,
        activeTab: activeTabRef.current,
        currentTime: player.currentTime,
        activeLineIndex,
        activeWordIndex,
      }),
    };
  }, [activeLineIndex, activeWordIndex, player.currentTime]);

  const autosave = useAutosave(adapter, getSnapshot, {
    isPlaying: player.isPlaying,
    currentTime: player.currentTime,
  });
  const { scheduleSave } = autosave;

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (!project) {
      return;
    }
    if (skipNextAutoScheduleRef.current) {
      skipNextAutoScheduleRef.current = false;
      return;
    }
    scheduleSave();
  }, [activeLineIndex, activeTab, activeWordIndex, project, scheduleSave]);

  useEffect(() => {
    return registerActiveFlushHandler(autosave.flush);
  }, [autosave.flush]);

  const applyEngineState = useCallback(
    (
      nextProject: ProjectFullData,
      peaks: number[],
      durationSec: number,
      lineIndex: number,
      wordIndex: number,
      currentTimeMs: number,
    ) => {
      projectRef.current = nextProject;
      setProject(nextProject);
      setWaveformPeaks(peaks);
      setAudioDuration(durationSec);

      suppressLineChangeRef.current = true;
      replaceLines(nextProject.lines, false);
      suppressLineChangeRef.current = false;

      setActiveLineIndex(lineIndex);
      setActiveWordIndex(wordIndex);
      resetHistory();
      setPlaybackRate(nextProject.settings.playbackRate);
      seekTo(currentTimeMs);
    },
    [
      replaceLines,
      resetHistory,
      seekTo,
      setActiveLineIndex,
      setActiveWordIndex,
      setPlaybackRate,
    ],
  );

  const hydrateRestoredPlan = useCallback(
    (plan: RestorePlan) => {
      skipNextAutoScheduleRef.current = true;
      activeTabRef.current = plan.activeTab;
      setActiveTabState(plan.activeTab);
      applyEngineState(
        plan.project,
        plan.peaks,
        plan.duration,
        plan.activeLineIndex,
        plan.activeWordIndex,
        plan.currentTime,
      );
    },
    [applyEngineState],
  );

  useRestoreHydration({
    status: restore.status,
    plan: restore.plan,
    hasManualOverride,
    onHydrate: hydrateRestoredPlan,
  });

  const setActiveTab = useCallback((tab: ActiveTab) => {
    activeTabRef.current = tab;
    setActiveTabState(tab);
  }, []);

  const applyLoadedProject = useCallback(
    (
      nextProject: ProjectFullData,
      nextUrl: string | null,
      peaks: number[],
      durationSec: number,
    ) => {
      clearRestoreAudioUrl();
      setHasManualOverride(true);
      replaceManualAudioUrl(nextUrl);
      applyEngineState(nextProject, peaks, durationSec, 0, 0, 0);
    },
    [applyEngineState, clearRestoreAudioUrl, replaceManualAudioUrl],
  );

  const onAudioAttached = useCallback(
    (
      targetProjectId: string,
      nextUrl: string | null,
      fileName: string,
      peaks: number[],
      durationSec: number,
    ) => {
      const current = projectRef.current;
      if (!current || current.id !== targetProjectId) {
        return;
      }
      clearRestoreAudioUrl();
      setHasManualOverride(true);
      replaceManualAudioUrl(nextUrl);
      setWaveformPeaks(peaks);
      setAudioDuration(durationSec);

      const updated = applyAttachedAudioToProject(
        current,
        fileName,
        peaks,
        durationSec,
      );
      projectRef.current = updated;
      setProject(updated);
    },
    [clearRestoreAudioUrl, replaceManualAudioUrl],
  );

  const { openProject, createProject, attachAudio } = useProjectLoader({
    adapter,
    project,
    flushAutosave: autosave.flush,
    pausePlayback: pause,
    applyLoadedProject,
    onAudioAttached,
  });

  const updateProjectMetadata = useCallback(
    (
      patch: Partial<Pick<ProjectFullData, 'title' | 'artist' | 'settings'>>,
    ) => {
      if (!projectRef.current) {
        return;
      }
      const updated = applyMetadataToProject(projectRef.current, patch);
      projectRef.current = updated;
      setProject(updated);
    },
    [],
  );

  const clearActiveProject = useCallback(async () => {
    autosave.cancel();
    pause();
    clearRestoreAudioUrl();
    setHasManualOverride(true);
    replaceManualAudioUrl(null);
    projectRef.current = null;
    setProject(null);
    setWaveformPeaks([]);
    setAudioDuration(0);
    suppressLineChangeRef.current = true;
    replaceLines([], false);
    suppressLineChangeRef.current = false;
    setActiveLineIndex(0);
    setActiveWordIndex(0);
    resetHistory();
    seekTo(0);
    await adapter.saveSessionState(
      buildSessionState({
        projectId: null,
        activeTab: activeTabRef.current,
        currentTime: 0,
        activeLineIndex: 0,
        activeWordIndex: 0,
      }),
    );
  }, [
    adapter,
    autosave,
    clearRestoreAudioUrl,
    pause,
    replaceLines,
    replaceManualAudioUrl,
    resetHistory,
    seekTo,
    setActiveLineIndex,
    setActiveWordIndex,
  ]);

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
      clearActiveProject,
      flushPendingSave: autosave.flush,
    }),
    [
      activeTab, attachAudio, audioDuration, autosave.autosaveState,
      autosave.flush, autosave.saveStatus, clearActiveProject, createProject, effectiveAudioUrl,
      openProject, player, project, restore.error, restore.status,
      setActiveTab, sync, updateProjectMetadata, waveformPeaks,
    ],
  );

  return (
    <ActiveProjectContext.Provider value={value}>
      {children}
    </ActiveProjectContext.Provider>
  );
}
