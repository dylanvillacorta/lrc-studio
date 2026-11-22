import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DesktopCatalogSidebar } from '@/app/layouts/DesktopCatalogSidebar';
import {
  DesktopHeader,
  type DesktopCenterView,
  type DesktopSyncMode,
} from '@/app/layouts/DesktopHeader';
import { DesktopInspectorSidebar } from '@/app/layouts/DesktopInspectorSidebar';
import { DesktopLineList } from '@/app/layouts/DesktopLineList';
import { DesktopSecondaryView } from '@/app/layouts/DesktopSecondaryView';
import { DesktopWaveformCard } from '@/app/layouts/DesktopWaveformCard';
import { DesktopWordStage } from '@/app/layouts/DesktopWordStage';
import { useActiveProject, useStorage } from '@/app/providers';
import { useCatalog } from '@/features/catalog';
import { type ParsedProjectJson } from '@/features/export';
import { type LineBounds } from '@/features/loupe';
import {
  computeCompensatedStampMs,
  computePreRollStartMs,
  DEFAULT_PRE_ROLL_MS,
  firstUnsyncedWordIndex,
  findNextUnsyncedWord,
  getActiveLineWindow,
  hasWordStampToUndo,
  readCurrentTimeMs,
  resolveWordEntryFocus,
  shiftTimings,
  SyncSettingsDialog,
} from '@/features/sync';
import { KaraokePreview } from '@/features/sync/components/KaraokePreview';
import { NoAudioCard } from '@/features/sync/components/NoAudioCard';
import {
  resolveWordTargetStartMs,
  type SyncSegmentedMode,
} from '@/features/sync/components/syncViewHelpers';
import { useKeyboardShortcuts } from '@/features/sync/hooks/useKeyboardShortcuts';
import { usePlaybackLineTracking } from '@/features/sync/hooks/usePlaybackLineTracking';
import {
  InfoDialog,
  UpdateBanner,
  useVersionCheck,
} from '@/features/version';
import { SyncButton } from '@/ui';
import { RestoreNoticeBanner } from './RestoreNoticeBanner';

/**
 * Vista principal de escritorio (≥ 768 px): 3 columnas (catálogo, editor, inspector)
 * con atajos de teclado globales y aviso de nueva versión.
 */
export function DesktopLayout() {
  const storage = useStorage();
  const {
    project,
    activeTab,
    setActiveTab,
    audioUrl,
    waveformPeaks,
    audioDuration,
    saveStatus,
    sync,
    player,
    latencyMs,
    setLatencyMs,
    openProject,
    createProject,
    attachAudio,
    updateProjectMetadata,
    clearActiveProject,
    flushPendingSave,
    restoreNotice,
    restoreError,
  } = useActiveProject();

  const catalog = useCatalog(storage);
  const { refresh: refreshCatalog } = catalog;
  const {
    updateAvailable,
    checking,
    builtAt,
    checkMessage,
    checkNow,
    applyUpdate,
  } = useVersionCheck({
    flush: flushPendingSave,
  });
  const [infoOpen, setInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [karaokeActive, setKaraokeActive] = useState(false);
  const [loupeReturnTab, setLoupeReturnTab] = useState<'sync' | 'word'>('sync');
  const [liveNotice, setLiveNotice] = useState('');
  const playerRef = useRef(player);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const getCurrentTimeMs = useCallback(
    () =>
      readCurrentTimeMs({
        getCurrentTimeMs: playerRef.current.getCurrentTimeMs,
        timeStore: playerRef.current.timeStore,
        currentTimeMs: playerRef.current.currentTime,
      }),
    [],
  );

  const durationMs =
    player.duration > 0
      ? player.duration
      : Math.round(audioDuration * 1000) || (project?.durationMs ?? 0);
  const preRollMs =
    project && project.settings.preRollSeconds > 0
      ? Math.round(project.settings.preRollSeconds * 1000)
      : DEFAULT_PRE_ROLL_MS;

  const centerView: DesktopCenterView =
    activeTab === 'lyrics' ||
    activeTab === 'export' ||
    activeTab === 'catalog' ||
    activeTab === 'loupe'
      ? activeTab
      : 'editor';

  const syncMode: DesktopSyncMode = karaokeActive
    ? 'karaoke'
    : activeTab === 'word'
      ? 'word'
      : 'line';

  useEffect(() => {
    if (activeTab === 'catalog') {
      void flushPendingSave().then(() => refreshCatalog());
    }
  }, [activeTab, flushPendingSave, refreshCatalog]);

  const prevProjectIdRef = useRef<string | null>(project?.id ?? null);
  useEffect(() => {
    const nextId = project?.id ?? null;
    if (saveStatus === 'saved' || (nextId !== null && nextId !== prevProjectIdRef.current)) {
      void refreshCatalog();
    }
    prevProjectIdRef.current = nextId;
  }, [project?.id, refreshCatalog, saveStatus]);

  const activeLine = sync.lines[sync.activeLineIndex];
  const targetWord = activeLine?.words[sync.activeWordIndex];
  const fallbackCurrentTimeMs = player.timeStore ? 0 : player.currentTime;
  const allWordsSynced = useMemo(
    () => findNextUnsyncedWord(sync.lines, { lineIndex: 0, wordIndex: 0 }) === null,
    [sync.lines],
  );
  const canUndoWord = useMemo(
    () =>
      hasWordStampToUndo(sync.lines, {
        lineIndex: sync.activeLineIndex,
        wordIndex: sync.activeWordIndex,
      }),
    [sync.activeLineIndex, sync.activeWordIndex, sync.lines],
  );
  const resolveWordIndexForLine = useMemo(
    () =>
      syncMode === 'word'
        ? (lineIndex: number) => firstUnsyncedWordIndex(sync.lines[lineIndex]) ?? 0
        : undefined,
    [sync.lines, syncMode],
  );
  const {
    playingLineIndex,
    trackedListIndex,
    selectLine: handleSelectLine,
    playFromLine: handlePlayFromLine,
  } = usePlaybackLineTracking({
    lines: sync.lines,
    isPlaying: player.isPlaying,
    activeLineIndex: sync.activeLineIndex,
    timeStore: player.timeStore,
    fallbackCurrentTimeMs,
    setActiveLineIndex: sync.setActiveLineIndex,
    setActiveWordIndex: sync.setActiveWordIndex,
    seekTo: player.seekTo,
    play: player.play,
    // En modo Palabra el foco solo lo mueven las marcas y la selección manual.
    followPlayback: syncMode !== 'word',
    resolveWordIndexForLine,
  });

  const handleSelectMode = useCallback(
    (mode: SyncSegmentedMode) => {
      if (mode === 'line') {
        setKaraokeActive(false);
        setActiveTab('sync');
      } else if (mode === 'word') {
        setKaraokeActive(false);
        setActiveTab('word');
        // Foco automático: primera palabra sin marca (de la línea activa o, si no, tras la última marcada).
        const focus = resolveWordEntryFocus(sync.lines, sync.activeLineIndex);
        sync.setActiveLineIndex(focus.lineIndex);
        sync.setActiveWordIndex(focus.wordIndex);
      } else if (mode === 'karaoke') {
        setKaraokeActive(true);
        setActiveTab('sync');
      }
    },
    [setActiveTab, sync],
  );

  const handleUploadAudio = useCallback(
    async (file: File) => {
      if (!project) {
        const baseTitle = file.name.replace(/\.[^.]+$/, '').trim() || 'Nueva canción';
        await createProject({ title: baseTitle, artist: '' });
      }
      await attachAudio(file);
    },
    [attachAudio, createProject, project],
  );

  const handleRepeatPreRoll = useCallback(() => {
    const targetStartMs =
      syncMode === 'word'
        ? resolveWordTargetStartMs(activeLine, sync.activeWordIndex)
        : (activeLine?.startMs ?? getCurrentTimeMs());
    player.seekTo(computePreRollStartMs(targetStartMs, preRollMs));
    void player.play();
    setLiveNotice('Repitiendo Pre-Roll');
  }, [activeLine, getCurrentTimeMs, player, preRollMs, sync.activeWordIndex, syncMode]);

  const handleStampStart = useCallback(() => {
    if (syncMode === 'karaoke') return;
    const nowMs = computeCompensatedStampMs(getCurrentTimeMs(), latencyMs);
    if (syncMode === 'word') {
      if (!targetWord) return;
      if (allWordsSynced) {
        setLiveNotice('Todas las palabras están marcadas. Deshaz para re-marcar la última');
        return;
      }
      if (!player.isPlaying) void player.play();
      const feedback = sync.stampWordStart(nowMs);
      setLiveNotice(
        feedback.completedAll
          ? `Palabra «${targetWord.text}» marcada. Todas las palabras están marcadas`
          : `Palabra «${targetWord.text}» marcada`,
      );
      return;
    }
    if (sync.lines.length === 0) return;
    sync.stampLineStart(nowMs, false);
    setLiveNotice(`Línea ${sync.activeLineIndex + 1} marcada`);
  }, [allWordsSynced, getCurrentTimeMs, latencyMs, player, sync, syncMode, targetWord]);

  /**
   * Deshacer en modo Palabra: desmarca la última palabra sincronizada, deja el foco en ella y
   * vuelve el audio a `inicio − Pre-Roll` reproduciendo para volver a marcarla.
   */
  const handleWordUndo = useCallback(() => {
    const result = sync.undoWordStamp(preRollMs);
    if (!result) {
      setLiveNotice('No hay marcas de palabra para deshacer');
      return;
    }
    player.seekTo(result.rewindTargetMs);
    void player.play();
    setLiveNotice(`Marca de «${result.wordText}» deshecha`);
  }, [player, preRollMs, sync]);

  const handleUndo = useCallback(() => {
    if (syncMode === 'word') {
      handleWordUndo();
      return;
    }
    sync.undo();
  }, [handleWordUndo, sync, syncMode]);

  const handleSelectWord = useCallback(
    (wordIndex: number) => {
      sync.setActiveWordIndex(wordIndex);
    },
    [sync],
  );

  const handleNudge = useCallback(
    (deltaMs: -50 | -10 | 10 | 50) => {
      if (syncMode === 'word' && targetWord && targetWord.startMs !== null) {
        sync.nudgeWord(sync.activeLineIndex, sync.activeWordIndex, 'startMs', deltaMs);
      } else if (activeLine && activeLine.startMs !== null) {
        sync.nudgeLine(sync.activeLineIndex, 'startMs', deltaMs);
      }
    },
    [activeLine, sync, syncMode, targetWord],
  );

  useKeyboardShortcuts({
    enabled: centerView === 'editor' && Boolean(audioUrl) && !settingsOpen && !infoOpen,
    onStampStart: handleStampStart,
    onRepeatPreRoll: handleRepeatPreRoll,
    onTogglePlay: player.togglePlay,
    onNudge: handleNudge,
    onUndo: handleUndo,
    onRedo: sync.redo,
  });

  const inspectorIsWord =
    syncMode === 'word' && Boolean(targetWord) && targetWord?.startMs !== null;
  const inspectorStartMs = inspectorIsWord
    ? (targetWord?.startMs ?? null)
    : (activeLine?.startMs ?? null);
  const inspectorEndMs = inspectorIsWord
    ? (targetWord?.endMs ?? null)
    : (activeLine?.endMs ?? null);
  const inspectorTargetLabel = inspectorIsWord
    ? `Palabra «${targetWord?.text ?? ''}»`
    : activeLine
      ? `Línea ${sync.activeLineIndex + 1} · ${activeLine.text}`
      : null;

  const handleInspectorBoundsChange = useCallback(
    (bounds: LineBounds) => {
      if (inspectorIsWord && activeLine && targetWord) {
        const nextLines = sync.lines.map((line, lIdx) =>
          lIdx === sync.activeLineIndex
            ? {
                ...line,
                words: line.words.map((w, wIdx) =>
                  wIdx === sync.activeWordIndex
                    ? { ...w, startMs: bounds.startMs, endMs: bounds.endMs }
                    : w,
                ),
              }
            : line,
        );
        sync.replaceLines(nextLines, false);
        return;
      }
      if (!activeLine) return;
      sync.replaceLines(
        sync.lines.map((line, idx) =>
          idx === sync.activeLineIndex
            ? { ...line, startMs: bounds.startMs, endMs: bounds.endMs }
            : line,
        ),
        false,
      );
    },
    [activeLine, inspectorIsWord, sync, targetWord],
  );

  const handleOpenLoupe = useCallback(() => {
    if (!activeLine) return;
    setKaraokeActive(false);
    setLoupeReturnTab(activeTab === 'word' ? 'word' : 'sync');
    setActiveTab('loupe');
  }, [activeLine, activeTab, setActiveTab]);

  const handleImportJson = useCallback(
    async (parsed: ParsedProjectJson) => {
      const title = parsed.metadata.title ?? 'Sin título';
      const artist = parsed.metadata.artist ?? '';
      if (!project) await createProject({ title, artist });
      else updateProjectMetadata({ title, artist });
      sync.replaceLines(parsed.lines);
      setActiveTab('sync');
    },
    [createProject, project, setActiveTab, sync, updateProjectMetadata],
  );

  const handleToggleLyrics = useCallback(() => {
    setActiveTab(centerView === 'lyrics' ? 'sync' : 'lyrics');
  }, [centerView, setActiveTab]);

  const handleToggleExport = useCallback(() => {
    setActiveTab(centerView === 'export' ? 'sync' : 'export');
  }, [centerView, setActiveTab]);

  const handleRetrySave = useCallback(() => {
    void flushPendingSave();
  }, [flushPendingSave]);

  const handleSidebarOpen = useCallback(
    async (id: string) => {
      await openProject(id);
      setActiveTab('sync');
    },
    [openProject, setActiveTab],
  );

  const handleSidebarCreate = useCallback(async () => {
    await createProject();
    setActiveTab('sync');
  }, [createProject, setActiveTab]);

  const handleOpenFullCatalog = useCallback(() => {
    setActiveTab('catalog');
  }, [setActiveTab]);

  const handleChangePlaybackRate = useCallback(
    (rate: number) => {
      player.setPlaybackRate(rate);
      if (project) {
        updateProjectMetadata({ settings: { ...project.settings, playbackRate: rate } });
      }
    },
    [player, project, updateProjectMetadata],
  );

  const handleSeekStart = useCallback(() => {
    player.setSeeking(true);
  }, [player]);

  const handleSeekEnd = useCallback(() => {
    player.setSeeking(false);
  }, [player]);

  const handlePlayLoupeLine = useCallback(() => {
    const win = getActiveLineWindow(sync.lines, sync.activeLineIndex, { preRollMs, durationMs });
    player.seekTo(win.windowStartMs);
    void player.play();
  }, [durationMs, player, preRollMs, sync.activeLineIndex, sync.lines]);

  const handleDeleteCatalogProject = useCallback(
    async (id: string) => {
      if (id === project?.id) {
        await clearActiveProject();
      }
      await catalog.deleteProject(id);
    },
    [catalog, clearActiveProject, project?.id],
  );

  const handleShiftTimings = useCallback(
    (deltaMs: number) => {
      sync.replaceLines(shiftTimings(sync.lines, deltaMs, durationMs), true);
    },
    [durationMs, sync],
  );

  return (
    <div className="min-h-dvh w-full bg-bg text-ink flex flex-col p-5 gap-4 overflow-x-hidden">
      <UpdateBanner updateAvailable={updateAvailable} onUpdate={applyUpdate} />
      <RestoreNoticeBanner message={restoreNotice ?? restoreError} />
      <DesktopHeader
        syncMode={syncMode}
        centerView={centerView}
        saveStatus={saveStatus}
        onSelectSyncMode={handleSelectMode}
        onToggleLyrics={handleToggleLyrics}
        onToggleExport={handleToggleExport}
        onRetrySave={handleRetrySave}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenInfo={() => setInfoOpen(true)}
      />
      <div className="flex-1 min-h-0 flex flex-col min-[1100px]:flex-row gap-5">
        <DesktopCatalogSidebar
          projects={catalog.projects}
          activeProjectId={project?.id ?? null}
          loading={catalog.loading}
          onOpen={handleSidebarOpen}
          onCreate={handleSidebarCreate}
          onOpenFullCatalog={handleOpenFullCatalog}
        />
        <main className="flex-1 min-w-0 flex flex-col gap-4">
          {centerView !== 'editor' ? (
            <DesktopSecondaryView
              centerView={centerView}
              project={project}
              catalog={catalog}
              lines={sync.lines}
              activeLineIndex={sync.activeLineIndex}
              waveformPeaks={waveformPeaks}
              durationMs={durationMs}
              timeStore={player.timeStore}
              currentTimeMs={fallbackCurrentTimeMs}
              isSaved={saveStatus === 'saved' || saveStatus === 'idle'}
              loupeReturnTab={loupeReturnTab}
              onOpenProject={openProject}
              onCreateProject={createProject}
              onDeleteProject={handleDeleteCatalogProject}
              onUpdateMetadata={updateProjectMetadata}
              onReplaceLines={sync.replaceLines}
              onImportJson={handleImportJson}
              onChangeLoupeBounds={handleInspectorBoundsChange}
              onPlayLoupeLine={handlePlayLoupeLine}
              onSetActiveTab={setActiveTab}
            />
          ) : !audioUrl ? (
            <NoAudioCard onUploadAudio={handleUploadAudio} />
          ) : (
            <>
              <DesktopWaveformCard
                peaks={waveformPeaks}
                timeStore={player.timeStore}
                getCurrentTimeMs={getCurrentTimeMs}
                currentTimeMs={fallbackCurrentTimeMs}
                durationMs={durationMs}
                isPlaying={player.isPlaying}
                playbackRate={player.playbackRate}
                lines={sync.lines}
                canUndo={syncMode === 'word' ? canUndoWord : sync.canUndo}
                canOpenLoupe={Boolean(activeLine)}
                onSeek={player.seekTo}
                onSeekStart={handleSeekStart}
                onSeekEnd={handleSeekEnd}
                onTogglePlay={player.togglePlay}
                onChangePlaybackRate={handleChangePlaybackRate}
                onUndo={handleUndo}
                onOpenLoupe={handleOpenLoupe}
              />
              {syncMode === 'karaoke' ? (
                <div className="h-[415px] min-[1100px]:h-[max(320px,calc(100dvh-385px))] flex flex-col min-h-0">
                  <KaraokePreview
                    hasAudio={Boolean(audioUrl)}
                    durationMs={durationMs}
                    isPlaying={player.isPlaying}
                    lines={sync.lines}
                    syncMode="karaoke"
                    timeStore={player.timeStore}
                    pausedTimeMs={player.timeStore ? -1 : player.currentTime}
                    getCurrentTimeMs={getCurrentTimeMs}
                    showModeSelector={false}
                    onSelectMode={handleSelectMode}
                    onTogglePlay={player.togglePlay}
                    onSeek={player.seekTo}
                    onUploadAudio={handleUploadAudio}
                  />
                </div>
              ) : (
                <>
                  {syncMode === 'word' ? (
                    <DesktopWordStage
                      activeLine={activeLine}
                      activeWordIndex={sync.activeWordIndex}
                      timeStore={player.timeStore}
                      currentTimeMs={fallbackCurrentTimeMs}
                      preRollMs={preRollMs}
                      allWordsSynced={allWordsSynced}
                      onSelectWord={handleSelectWord}
                      onRepeatPreRoll={handleRepeatPreRoll}
                      onStampWordStart={handleStampStart}
                    />
                  ) : null}
                  <DesktopLineList
                    lines={sync.lines}
                    activeLineIndex={sync.activeLineIndex}
                    playingLineIndex={playingLineIndex}
                    trackedListIndex={trackedListIndex}
                    autoCenter={syncMode !== 'word'}
                    onSelectLine={handleSelectLine}
                    onPlayFromLine={handlePlayFromLine}
                    onClearLineMark={sync.clearLineMark}
                  />
                  {syncMode !== 'word' ? (
                    <SyncButton
                      title={sync.lines.length > 0 ? `MARCAR LÍNEA ${sync.activeLineIndex + 1}` : 'SIN LETRA PARA MARCAR'}
                      hint="Toca o pulsa Espacio al empezar a cantarla"
                      disabled={sync.lines.length === 0}
                      onPointerDown={handleStampStart}
                      onContextMenu={(e) => e.preventDefault()}
                      className="min-h-[84px]"
                      style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
                    />
                  ) : null}
                </>
              )}
            </>
          )}
        </main>
        <DesktopInspectorSidebar
          targetLabel={inspectorTargetLabel}
          startMs={inspectorStartMs}
          endMs={inspectorEndMs}
          durationMs={durationMs}
          canOpenLoupe={Boolean(activeLine)}
          onChangeBounds={handleInspectorBoundsChange}
          onOpenLoupe={handleOpenLoupe}
        />
      </div>
      <SyncSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        latencyMs={latencyMs}
        onChangeLatencyMs={setLatencyMs}
        lines={sync.lines}
        durationMs={durationMs}
        onShiftTimings={handleShiftTimings}
        onUndoShift={sync.undo}
      />
      <InfoDialog
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        builtAt={builtAt}
        updateAvailable={updateAvailable}
        checking={checking}
        checkMessage={checkMessage}
        onCheckUpdates={checkNow}
        onApplyUpdate={applyUpdate}
      />
      <div aria-live="polite" className="sr-only">
        {liveNotice}
      </div>
    </div>
  );
}
