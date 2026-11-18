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
  buildStructuredLinesFromText,
  INITIAL_DEMO_LYRICS,
} from '@/features/lyrics';
import {
  computePreRollStartMs,
  DEFAULT_PRE_ROLL_MS,
  getActiveLineWindow,
} from '@/features/sync';
import { KaraokePreview } from '@/features/sync/components/KaraokePreview';
import { NoAudioCard } from '@/features/sync/components/NoAudioCard';
import {
  createDemoAudioFile,
  resolveWordTargetStartMs,
  type SyncSegmentedMode,
} from '@/features/sync/components/syncViewHelpers';
import { useKeyboardShortcuts } from '@/features/sync/hooks/useKeyboardShortcuts';
import {
  UpdateBanner,
  VersionFooter,
  useVersionCheck,
} from '@/features/version';
import { formatDisplayTime } from '@/lib/time';
import type { WordSyncSubMode } from '@/types';
import { Pill, RaisedButton, SyncButton } from '@/ui';

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
    openProject,
    createProject,
    attachAudio,
    updateProjectMetadata,
    clearActiveProject,
    flushPendingSave,
  } = useActiveProject();

  const catalog = useCatalog(storage);
  const { refresh: refreshCatalog } = catalog;
  const { updateAvailable, applyUpdate } = useVersionCheck({
    flush: flushPendingSave,
  });

  const [burstActive, setBurstActive] = useState(false);
  const [karaokeActive, setKaraokeActive] = useState(false);
  const [holdMode, setHoldMode] = useState(false);
  const [loupeReturnTab, setLoupeReturnTab] = useState<'sync' | 'word'>('sync');
  const [liveNotice, setLiveNotice] = useState('');
  const playerTimeRef = useRef(player.currentTime);

  useEffect(() => {
    playerTimeRef.current = player.currentTime;
  }, [player.currentTime]);

  const durationMs =
    player.duration > 0
      ? player.duration
      : Math.round(audioDuration * 1000) || (project?.durationMs ?? 0);
  const preRollMs =
    project && project.settings.preRollSeconds > 0
      ? Math.round(project.settings.preRollSeconds * 1000)
      : DEFAULT_PRE_ROLL_MS;
  const sniperMode = project?.settings.sniperMode ?? true;
  const subMode: WordSyncSubMode = sniperMode ? 'sniper' : holdMode ? 'hold' : 'tap';

  const centerView: DesktopCenterView =
    activeTab === 'lyrics' ||
    activeTab === 'export' ||
    activeTab === 'catalog' ||
    activeTab === 'loupe'
      ? activeTab
      : 'editor';

  const syncMode: DesktopSyncMode = karaokeActive
    ? 'karaoke'
    : burstActive
      ? 'burst'
      : activeTab === 'word'
        ? 'word'
        : 'line';

  const burstWindow = useMemo(() => {
    if (!burstActive || sync.lines.length === 0) return null;
    return getActiveLineWindow(sync.lines, sync.activeLineIndex, {
      preRollMs,
      durationMs,
    });
  }, [burstActive, durationMs, preRollMs, sync.activeLineIndex, sync.lines]);

  useEffect(() => {
    if (burstActive && burstWindow && player.isPlaying && player.currentTime >= burstWindow.windowEndMs) {
      player.seekTo(burstWindow.windowStartMs);
    }
  }, [burstActive, burstWindow, player]);

  useEffect(() => {
    if (activeTab === 'catalog') {
      void flushPendingSave().then(() => refreshCatalog());
    }
  }, [activeTab, flushPendingSave, refreshCatalog]);

  useEffect(() => {
    if (saveStatus === 'saved') {
      void refreshCatalog();
    }
  }, [project?.id, refreshCatalog, saveStatus]);

  const activeLine = sync.lines[sync.activeLineIndex];
  const targetWord = activeLine?.words[sync.activeWordIndex];

  const handleSelectMode = useCallback(
    (mode: SyncSegmentedMode) => {
      if (mode === 'line') {
        setKaraokeActive(false);
        setBurstActive(false);
        setActiveTab('sync');
      } else if (mode === 'word') {
        setKaraokeActive(false);
        setBurstActive(false);
        setActiveTab('word');
      } else if (mode === 'burst' && sync.lines.length > 0) {
        const win = getActiveLineWindow(sync.lines, sync.activeLineIndex, { preRollMs, durationMs });
        setKaraokeActive(false);
        setBurstActive(true);
        setActiveTab('sync');
        player.seekTo(win.windowStartMs);
        void player.play();
      } else if (mode === 'karaoke') {
        setBurstActive(false);
        setKaraokeActive(true);
        setActiveTab('sync');
      }
    },
    [durationMs, player, preRollMs, setActiveTab, sync.activeLineIndex, sync.lines],
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

  const handleUseDemo = useCallback(async () => {
    if (!project) {
      await createProject({ title: 'Noches de Verano', artist: 'Luna Alba' });
    }
    const demo = createDemoAudioFile(28);
    await attachAudio(demo.file);
    if (sync.lines.length === 0) {
      sync.replaceLines(buildStructuredLinesFromText(INITIAL_DEMO_LYRICS, true), false);
    }
  }, [attachAudio, createProject, project, sync]);

  const handleRepeatPreRoll = useCallback(() => {
    const targetStartMs =
      syncMode === 'word'
        ? resolveWordTargetStartMs(activeLine, sync.activeWordIndex)
        : (activeLine?.startMs ?? playerTimeRef.current);
    player.seekTo(computePreRollStartMs(targetStartMs, preRollMs));
    void player.play();
    setLiveNotice('Repitiendo Pre-Roll');
  }, [activeLine, player, preRollMs, sync.activeWordIndex, syncMode]);

  const applyWordFeedback = useCallback(
    (feedback: { shouldPause: boolean; shouldRewindPreRoll: boolean }, nowMs: number) => {
      if (feedback.shouldPause) {
        player.pause();
      } else if (feedback.shouldRewindPreRoll) {
        const nextTarget = resolveWordTargetStartMs(activeLine, sync.activeWordIndex + 1);
        player.seekTo(computePreRollStartMs(nextTarget ?? nowMs, preRollMs));
        void player.play();
      }
    },
    [activeLine, player, preRollMs, sync.activeWordIndex],
  );

  const handleStampStart = useCallback(() => {
    const nowMs = playerTimeRef.current;
    if (syncMode === 'word') {
      if (!targetWord) return;
      if (!player.isPlaying) void player.play();
      const feedback = sync.stampWordStart({
        nowMs,
        subMode,
        sniperHoldDuration: holdMode,
        sniperAutoAdvancePreRoll: true,
      });
      if (!holdMode) applyWordFeedback(feedback, nowMs);
      setLiveNotice(`Palabra «${targetWord.text}» marcada`);
      return;
    }
    if (sync.lines.length === 0) return;
    sync.stampLineStart(nowMs, false);
    setLiveNotice(`Línea ${sync.activeLineIndex + 1} marcada`);
  }, [applyWordFeedback, holdMode, player, subMode, sync, syncMode, targetWord]);

  const handleStampEnd = useCallback(() => {
    if (syncMode !== 'word' || !holdMode || !targetWord) return;
    const nowMs = playerTimeRef.current;
    const feedback = sync.stampWordEnd({
      nowMs,
      subMode,
      sniperHoldDuration: holdMode,
      sniperAutoAdvancePreRoll: true,
    });
    applyWordFeedback(feedback, nowMs);
  }, [applyWordFeedback, holdMode, subMode, sync, syncMode, targetWord]);

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
    enabled: centerView === 'editor' && Boolean(audioUrl),
    onStampStart: handleStampStart,
    onStampEnd: handleStampEnd,
    onRepeatPreRoll: handleRepeatPreRoll,
    onTogglePlay: player.togglePlay,
    onNudge: handleNudge,
    onUndo: sync.undo,
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

  const handleInspectorBoundsChange = (bounds: LineBounds) => {
    if (inspectorIsWord && activeLine && targetWord) {
      const nextLines = sync.lines.map((line, lIdx) =>
        lIdx === sync.activeLineIndex
          ? {
              ...line,
              words: line.words.map((w, wIdx) =>
                wIdx === sync.activeWordIndex ? { ...w, startMs: bounds.startMs, endMs: bounds.endMs } : w,
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
        idx === sync.activeLineIndex ? { ...line, startMs: bounds.startMs, endMs: bounds.endMs } : line,
      ),
      false,
    );
  };

  const handleOpenLoupe = () => {
    if (!activeLine) return;
    setBurstActive(false);
    setKaraokeActive(false);
    setLoupeReturnTab(activeTab === 'word' ? 'word' : 'sync');
    setActiveTab('loupe');
  };

  const handleImportJson = async (parsed: ParsedProjectJson) => {
    const title = parsed.metadata.title ?? 'Sin título';
    const artist = parsed.metadata.artist ?? '';
    if (!project) await createProject({ title, artist });
    else updateProjectMetadata({ title, artist });
    sync.replaceLines(parsed.lines);
    setActiveTab('sync');
  };

  return (
    <div className="min-h-dvh w-full bg-bg text-ink flex flex-col p-5 gap-4 overflow-x-hidden">
      <UpdateBanner updateAvailable={updateAvailable} onUpdate={applyUpdate} />
      <DesktopHeader
        syncMode={syncMode}
        centerView={centerView}
        saveStatus={saveStatus}
        onSelectSyncMode={handleSelectMode}
        onToggleLyrics={() => setActiveTab(centerView === 'lyrics' ? 'sync' : 'lyrics')}
        onToggleExport={() => setActiveTab(centerView === 'export' ? 'sync' : 'export')}
        onRetrySave={() => void flushPendingSave()}
      />
      <div className="flex-1 min-h-0 flex flex-col min-[1100px]:flex-row gap-5">
        <DesktopCatalogSidebar
          projects={catalog.projects}
          activeProjectId={project?.id ?? null}
          loading={catalog.loading}
          onOpen={async (id) => {
            await openProject(id);
            setActiveTab('sync');
          }}
          onCreate={async () => {
            await createProject();
            setActiveTab('sync');
          }}
          onOpenFullCatalog={() => setActiveTab('catalog')}
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
              currentTimeMs={player.currentTime}
              isSaved={saveStatus === 'saved' || saveStatus === 'idle'}
              loupeReturnTab={loupeReturnTab}
              onOpenProject={openProject}
              onCreateProject={createProject}
              onDeleteProject={async (id) => {
                if (id === project?.id) {
                  await clearActiveProject();
                }
                await catalog.deleteProject(id);
              }}
              onUpdateMetadata={updateProjectMetadata}
              onReplaceLines={sync.replaceLines}
              onLoadDemo={handleUseDemo}
              onImportJson={handleImportJson}
              onChangeLoupeBounds={handleInspectorBoundsChange}
              onPlayLoupeBurst={() => {
                const win = getActiveLineWindow(sync.lines, sync.activeLineIndex, { preRollMs, durationMs });
                player.seekTo(win.windowStartMs);
                void player.play();
              }}
              onSetActiveTab={setActiveTab}
            />
          ) : !audioUrl ? (
            <NoAudioCard onUploadAudio={handleUploadAudio} onUseDemo={handleUseDemo} />
          ) : (
            <>
              <DesktopWaveformCard
                peaks={waveformPeaks}
                currentTimeMs={player.currentTime}
                durationMs={durationMs}
                isPlaying={player.isPlaying}
                playbackRate={player.playbackRate}
                lines={sync.lines}
                canUndo={sync.canUndo}
                canOpenLoupe={Boolean(activeLine)}
                onSeek={player.seekTo}
                onTogglePlay={player.togglePlay}
                onChangePlaybackRate={(rate) => {
                  player.setPlaybackRate(rate);
                  if (project) updateProjectMetadata({ settings: { ...project.settings, playbackRate: rate } });
                }}
                onUndo={sync.undo}
                onOpenLoupe={handleOpenLoupe}
              />
              {burstActive && burstWindow ? (
                <div className="flex items-center justify-between gap-2 px-1">
                  <Pill variant="acc">
                    <span>
                      Ráfaga en bucle · {formatDisplayTime(burstWindow.windowStartMs)} –{' '}
                      {formatDisplayTime(burstWindow.windowEndMs)}
                    </span>
                  </Pill>
                  <RaisedButton
                    size="sm"
                    onClick={() => {
                      setBurstActive(false);
                      player.pause();
                    }}
                    className="min-h-12 px-3 text-xs font-extrabold"
                  >
                    Detener ráfaga
                  </RaisedButton>
                </div>
              ) : null}
              {syncMode === 'karaoke' ? (
                <KaraokePreview
                  hasAudio={Boolean(audioUrl)}
                  durationMs={durationMs}
                  isPlaying={player.isPlaying}
                  lines={sync.lines}
                  syncMode="karaoke"
                  pausedTimeMs={player.currentTime}
                  getCurrentTimeMs={() => playerTimeRef.current}
                  onSelectMode={handleSelectMode}
                  onTogglePlay={player.togglePlay}
                  onSeek={player.seekTo}
                  onUploadAudio={handleUploadAudio}
                  onUseDemo={handleUseDemo}
                />
              ) : (
                <>
                  {syncMode === 'word' ? (
                    <DesktopWordStage
                      activeLine={activeLine}
                      activeWordIndex={sync.activeWordIndex}
                      currentTimeMs={player.currentTime}
                      preRollMs={preRollMs}
                      sniperMode={sniperMode}
                      holdMode={holdMode}
                      onToggleSniper={() => {
                        if (project) updateProjectMetadata({ settings: { ...project.settings, sniperMode: !sniperMode } });
                      }}
                      onToggleHold={() => setHoldMode((prev) => !prev)}
                      onRepeatPreRoll={handleRepeatPreRoll}
                      onStampWordStart={handleStampStart}
                      onStampWordEnd={handleStampEnd}
                    />
                  ) : null}
                  <DesktopLineList
                    lines={sync.lines}
                    activeLineIndex={sync.activeLineIndex}
                    onSelectLine={(index) => {
                      sync.setActiveLineIndex(index);
                      sync.setActiveWordIndex(0);
                    }}
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
      <VersionFooter />
      <div aria-live="polite" className="sr-only">
        {liveNotice}
      </div>
    </div>
  );
}
