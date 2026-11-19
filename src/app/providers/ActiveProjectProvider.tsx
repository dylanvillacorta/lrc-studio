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
import type { SeekOrigin } from '@/features/sync/hooks/audioSeekLogic';
import { useObjectUrlState } from '@/app/providers/useObjectUrlState';
import { useProjectLoader } from '@/app/providers/useProjectLoader';
import { useRestoreHydration } from '@/app/providers/useRestoreHydration';
import {
  buildSessionState,
  useAutosave,
  createAudioObjectUrl,
  useDeviceLatency,
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
  const { latencyMs, setLatencyMs } = useDeviceLatency(adapter);
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
  const activeLineIndexRef = useRef(0);
  const activeWordIndexRef = useRef(0);
  const suppressLineChangeRef = useRef(false);

  const effectiveAudioUrl = hasManualOverride
    ? manualAudioUrl
    : restore.audioUrl;

  // Auto-reparación (T26): equivale a «Continuar»: relee bytes, Blob con mime canónico
  // y nueva ObjectURL (la anterior se revoca al reemplazarla).
  const reloadAudioSource = useCallback(async (): Promise<string | null> => {
    const current = projectRef.current;
    if (!current) {
      return null;
    }
    const stored = await adapter.getAudioBinary(current.id);
    if (!stored || projectRef.current?.id !== current.id) {
      return null;
    }
    const url = createAudioObjectUrl(stored.blob, stored.fileName);
    if (!url) {
      return null;
    }
    clearRestoreAudioUrl();
    setHasManualOverride(true);
    replaceManualAudioUrl(url);
    return url;
  }, [adapter, clearRestoreAudioUrl, replaceManualAudioUrl]);

  const player = useAudioPlayer({
    src: effectiveAudioUrl,
    projectId: project?.id ?? null,
    reloadAudioSource,
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
  const { pause, seekTo, setPlaybackRate, timeStore: playerTimeStore } = player;

  useEffect(() => {
    activeLineIndexRef.current = activeLineIndex;
  }, [activeLineIndex]);

  useEffect(() => {
    activeWordIndexRef.current = activeWordIndex;
  }, [activeWordIndex]);

  const getSnapshot = useCallback((): AutosaveSnapshot => {
    const activeProject = projectRef.current;
    return {
      project: activeProject,
      session: buildSessionState({
        projectId: activeProject?.id ?? null,
        activeTab: activeTabRef.current,
        currentTime: playerTimeStore?.getTimeMs() ?? 0,
        activeLineIndex: activeLineIndexRef.current,
        activeWordIndex: activeWordIndexRef.current,
      }),
    };
  }, [playerTimeStore]);

  const autosave = useAutosave(adapter, getSnapshot, {
    isPlaying: player.isPlaying,
    timeStore: playerTimeStore,
  });
  const {
    autosaveState,
    cancel: cancelAutosave,
    flush: flushAutosave,
    markBaseline,
    markProjectBaseline,
    markSessionBaseline,
    saveStatus,
    scheduleProjectSave,
    scheduleSessionSave,
  } = autosave;

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Solo cambios reales en los datos del proyecto activan el autoguardado visible (300 ms).
  useEffect(() => {
    if (!project) {
      return;
    }
    scheduleProjectSave();
  }, [project, scheduleProjectSave]);

  // Cambios de pestaña o índices activos se guardan en silencio sin alterar el indicador.
  useEffect(() => {
    if (!projectRef.current) {
      return;
    }
    scheduleSessionSave();
  }, [activeLineIndex, activeTab, activeWordIndex, project?.id, scheduleSessionSave]);

  useEffect(() => {
    return registerActiveFlushHandler(flushAutosave);
  }, [flushAutosave]);

  const applyEngineState = useCallback(
    (
      nextProject: ProjectFullData,
      peaks: number[],
      durationSec: number,
      lineIndex: number,
      wordIndex: number,
      currentTimeMs: number,
      seekOrigin: SeekOrigin = 'user',
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
      seekTo(currentTimeMs, seekOrigin);
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
      activeTabRef.current = plan.activeTab;
      activeLineIndexRef.current = plan.activeLineIndex;
      activeWordIndexRef.current = plan.activeWordIndex;
      markBaseline(
        plan.project,
        buildSessionState({
          projectId: plan.project.id,
          activeTab: plan.activeTab,
          currentTime: plan.currentTime,
          activeLineIndex: plan.activeLineIndex,
          activeWordIndex: plan.activeWordIndex,
        }),
      );
      setActiveTabState(plan.activeTab);
      applyEngineState(
        plan.project,
        plan.peaks,
        plan.duration,
        plan.activeLineIndex,
        plan.activeWordIndex,
        plan.currentTime,
        'restore',
      );
    },
    [applyEngineState, markBaseline],
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
      markProjectBaseline(nextProject);
      activeLineIndexRef.current = 0;
      activeWordIndexRef.current = 0;
      applyEngineState(nextProject, peaks, durationSec, 0, 0, 0);
    },
    [
      applyEngineState,
      clearRestoreAudioUrl,
      markProjectBaseline,
      replaceManualAudioUrl,
    ],
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
    flushAutosave,
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
    cancelAutosave();
    markProjectBaseline(null);
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
    activeLineIndexRef.current = 0;
    activeWordIndexRef.current = 0;
    setActiveLineIndex(0);
    setActiveWordIndex(0);
    resetHistory();
    seekTo(0);
    const clearedSession = buildSessionState({
      projectId: null,
      activeTab: activeTabRef.current,
      currentTime: 0,
      activeLineIndex: 0,
      activeWordIndex: 0,
    });
    markSessionBaseline(clearedSession);
    await adapter.saveSessionState(clearedSession);
  }, [
    adapter,
    cancelAutosave,
    clearRestoreAudioUrl,
    markProjectBaseline,
    markSessionBaseline,
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
      saveStatus,
      autosaveState,
      sync,
      player,
      latencyMs,
      setLatencyMs,
      openProject,
      createProject,
      attachAudio,
      updateProjectMetadata,
      clearActiveProject,
      flushPendingSave: flushAutosave,
    }),
    [
      activeTab,
      attachAudio,
      audioDuration,
      autosaveState,
      clearActiveProject,
      createProject,
      effectiveAudioUrl,
      flushAutosave,
      latencyMs,
      openProject,
      player,
      project,
      restore.error,
      restore.status,
      saveStatus,
      setActiveTab,
      setLatencyMs,
      sync,
      updateProjectMetadata,
      waveformPeaks,
    ],
  );

  const repairStatus = player.repairStatus ?? 'idle';
  const retryRepair = player.retryRepair;

  // El botón de reproducir (fuera de este módulo) refleja la preparación con aria-busy.
  useEffect(() => {
    if (repairStatus !== 'repairing' || typeof document === 'undefined') {
      return;
    }
    const buttons = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button[aria-label="Reproducir"], button[aria-label="Pausar"]',
      ),
    );
    buttons.forEach((button) => button.setAttribute('aria-busy', 'true'));
    return () => {
      buttons.forEach((button) => button.removeAttribute('aria-busy'));
    };
  }, [repairStatus]);

  return (
    <ActiveProjectContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
        data-testid="audio-repair-status"
      >
        {repairStatus === 'repairing' ? (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="rounded-full bg-black/80 px-4 py-2 text-sm text-white"
          >
            Preparando audio…
          </div>
        ) : null}
        {repairStatus === 'failed' ? (
          <div
            role="alert"
            className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-black/85 px-4 py-2 text-sm text-white"
          >
            <span>No se pudo preparar el audio. Revisa el archivo e inténtalo de nuevo.</span>
            <button
              type="button"
              className="min-h-11 rounded-full bg-white px-4 font-semibold text-black"
              onClick={() => retryRepair?.()}
            >
              Reintentar
            </button>
          </div>
        ) : null}
      </div>
    </ActiveProjectContext.Provider>
  );
}
