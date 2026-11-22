import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MobileHeader } from '@/app/layouts/MobileHeader';
import { useActiveProject, useStorage } from '@/app/providers';
import { CatalogPanel, useCatalog } from '@/features/catalog';
import { ExportScreen, type ParsedProjectJson } from '@/features/export';
import { LoupeScreen, type LineBounds } from '@/features/loupe';
import {
  LyricsScreen,
  mergeRawTextWithExistingLines,
} from '@/features/lyrics';
import {
  DEFAULT_PRE_ROLL_MS,
  firstUnsyncedWordIndex,
  getActiveLineWindow,
  hasWordStampToUndo,
  readCurrentTimeMs,
  resolveWordEntryFocus,
  shiftTimings,
  SyncSettingsDialog,
} from '@/features/sync';
import { KaraokePreview } from '@/features/sync/components/KaraokePreview';
import { LineSyncScreen } from '@/features/sync/components/LineSyncScreen';
import { type SyncSegmentedMode } from '@/features/sync/components/syncViewHelpers';
import { WordSyncScreen } from '@/features/sync/components/WordSyncScreen';
import {
  usePlaybackTime,
  type PlaybackTimeStore,
} from '@/features/sync/hooks/playbackTimeStore';
import { usePlaybackLineTracking } from '@/features/sync/hooks/usePlaybackLineTracking';
import {
  InfoDialog,
  UpdateBanner,
  useVersionCheck,
} from '@/features/version';
import { downloadTextFile } from '@/lib/download';
import type { LyricLine } from '@/types';
import { NavBar, ScrollShadow, type NavBarItem } from '@/ui';
import { RestoreNoticeBanner } from './RestoreNoticeBanner';

const NAV_ITEMS: readonly NavBarItem<'catalog' | 'lyrics' | 'sync' | 'export'>[] = [
  { id: 'catalog', label: 'Catálogo', icon: 'library' },
  { id: 'lyrics', label: 'Letra', icon: 'lines' },
  { id: 'sync', label: 'Sincronizar', icon: 'sync' },
  { id: 'export', label: 'Exportar', icon: 'export' },
];

const MobileLoupeBridge = memo(function MobileLoupeBridge({
  peaks,
  durationMs,
  timeStore,
  fallbackTimeMs,
  line,
  lineIndex,
  lines,
  isSaved,
  onChange,
  onPlayLine,
  onApply,
  onBack,
}: {
  peaks: number[];
  durationMs: number;
  timeStore: PlaybackTimeStore | null;
  fallbackTimeMs: number;
  line: LyricLine;
  lineIndex: number;
  lines: LyricLine[];
  isSaved: boolean;
  onChange: (bounds: LineBounds) => void;
  onPlayLine: () => void;
  onApply: (bounds: LineBounds) => void;
  onBack: () => void;
}) {
  const effectiveTimeMs = usePlaybackTime(timeStore, fallbackTimeMs, 33);
  return (
    <LoupeScreen
      peaks={peaks}
      durationMs={durationMs}
      currentTimeMs={effectiveTimeMs}
      line={line}
      lineIndex={lineIndex}
      lines={lines}
      isSaved={isSaved}
      onChange={onChange}
      onPlayLine={onPlayLine}
      onApply={onApply}
      onBack={onBack}
    />
  );
});

/**
 * Contenedor principal móvil («Estudio táctil» 390×844) que conecta las 6 vistas.
 */
export function MobileLayout() {
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
  const [syncSubView, setSyncSubView] = useState<'default' | 'karaoke'>('default');
  const [loupeReturnTab, setLoupeReturnTab] = useState<'sync' | 'word'>('sync');
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

  useEffect(() => {
    if (activeTab === 'catalog') {
      void flushPendingSave().then(() => refreshCatalog());
    }
  }, [activeTab, flushPendingSave, refreshCatalog]);

  const { seekTo, play, togglePlay } = player;
  const {
    lines: syncLines,
    activeLineIndex: syncActiveLineIndex,
    setActiveLineIndex: setSyncActiveLineIndex,
    setActiveWordIndex: setSyncActiveWordIndex,
  } = sync;

  const fallbackCurrentTimeMs = player.timeStore ? 0 : player.currentTime;
  const resolveWordIndexForLine = useMemo(
    () =>
      activeTab === 'word'
        ? (lineIndex: number) => firstUnsyncedWordIndex(syncLines[lineIndex]) ?? 0
        : undefined,
    [activeTab, syncLines],
  );
  const {
    playingLineIndex,
    trackedListIndex,
    selectLine: handleSelectLine,
    playFromLine: handlePlayFromLine,
  } = usePlaybackLineTracking({
    lines: syncLines,
    isPlaying: player.isPlaying,
    activeLineIndex: syncActiveLineIndex,
    timeStore: player.timeStore,
    fallbackCurrentTimeMs,
    setActiveLineIndex: setSyncActiveLineIndex,
    setActiveWordIndex: setSyncActiveWordIndex,
    seekTo,
    play,
    // En modo Palabra el foco solo lo mueven las marcas y la selección manual.
    followPlayback: activeTab !== 'word',
    resolveWordIndexForLine,
  });

  const handleSelectMode = useCallback(
    (mode: SyncSegmentedMode) => {
      if (mode === 'line') {
        setSyncSubView('default');
        setActiveTab('sync');
        return;
      }
      if (mode === 'word') {
        setSyncSubView('default');
        setActiveTab('word');
        // Foco automático: primera palabra sin marca (de la línea activa o, si no, tras la última marcada).
        const focus = resolveWordEntryFocus(syncLines, syncActiveLineIndex);
        setSyncActiveLineIndex(focus.lineIndex);
        setSyncActiveWordIndex(focus.wordIndex);
        return;
      }
      setSyncSubView('karaoke');
      setActiveTab('sync');
    },
    [
      setActiveTab,
      setSyncActiveLineIndex,
      setSyncActiveWordIndex,
      syncActiveLineIndex,
      syncLines,
    ],
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

  const handleOpenLoupe = useCallback(() => {
    if (!sync.lines[sync.activeLineIndex]) {
      return;
    }
    setSyncSubView('default');
    setLoupeReturnTab(activeTab === 'word' ? 'word' : 'sync');
    setActiveTab('loupe');
  }, [activeTab, setActiveTab, sync.activeLineIndex, sync.lines]);

  const handleLoupeBoundsChange = useCallback(
    (bounds: LineBounds) => {
      const line = sync.lines[sync.activeLineIndex];
      if (!line) {
        return;
      }
      const nextLines = sync.lines.map((item, idx) =>
        idx === sync.activeLineIndex
          ? { ...item, startMs: bounds.startMs, endMs: bounds.endMs }
          : item,
      );
      sync.replaceLines(nextLines, false);
    },
    [sync],
  );

  const handleLoupePlayLine = useCallback(() => {
    const win = getActiveLineWindow(sync.lines, sync.activeLineIndex, {
      preRollMs,
      durationMs,
    });
    player.seekTo(win.windowStartMs);
    void player.play();
  }, [durationMs, player, preRollMs, sync.activeLineIndex, sync.lines]);

  const handleImportJson = useCallback(
    async (parsed: ParsedProjectJson) => {
      const title = parsed.metadata.title ?? 'Sin título';
      const artist = parsed.metadata.artist ?? '';
      if (!project) {
        await createProject({ title, artist });
      } else {
        updateProjectMetadata({ title, artist });
      }
      sync.replaceLines(parsed.lines);
      setActiveTab('sync');
    },
    [createProject, project, setActiveTab, sync, updateProjectMetadata],
  );

  const handleNavSelect = useCallback(
    (tab: 'catalog' | 'lyrics' | 'sync' | 'export') => {
      setSyncSubView('default');
      setActiveTab(tab);
    },
    [setActiveTab],
  );

  const handleOpenCatalogFromHeader = useCallback(() => {
    handleNavSelect('catalog');
  }, [handleNavSelect]);

  const handleRetrySave = useCallback(() => {
    void flushPendingSave();
  }, [flushPendingSave]);

  const handleChangePlaybackRate = useCallback(
    (rate: number) => {
      player.setPlaybackRate(rate);
      if (project) {
        updateProjectMetadata({
          settings: { ...project.settings, playbackRate: rate },
        });
      }
    },
    [player, project, updateProjectMetadata],
  );

  const handleStampLine = useCallback(
    (nowMs: number) => {
      sync.stampLineStart(nowMs, false);
    },
    [sync],
  );

  const handleShiftTimings = useCallback(
    (deltaMs: number) => {
      sync.replaceLines(shiftTimings(sync.lines, deltaMs, durationMs), true);
    },
    [durationMs, sync],
  );

  const handleSeekStart = useCallback(() => {
    player.setSeeking(true);
  }, [player]);

  const handleSeekEnd = useCallback(() => {
    player.setSeeking(false);
  }, [player]);

  const handleStampWord = useCallback(
    (nowMs: number) => sync.stampWordStart(nowMs),
    [sync],
  );

  const handleSelectWord = useCallback(
    (wordIndex: number) => {
      sync.setActiveWordIndex(wordIndex);
    },
    [sync],
  );

  /**
   * Deshacer en modo Palabra: desmarca la última palabra sincronizada, deja el foco en ella y
   * vuelve el audio a `inicio − Pre-Roll` reproduciendo para volver a marcarla.
   */
  const handleWordUndo = useCallback(() => {
    const result = sync.undoWordStamp(preRollMs);
    if (!result) {
      return null;
    }
    player.seekTo(result.rewindTargetMs);
    void player.play();
    return { wordText: result.wordText };
  }, [player, preRollMs, sync]);

  const canUndoWord = hasWordStampToUndo(sync.lines, {
    lineIndex: sync.activeLineIndex,
    wordIndex: sync.activeWordIndex,
  });

  const handleLoupeApply = useCallback(
    (bounds: LineBounds) => {
      handleLoupeBoundsChange(bounds);
      setActiveTab(loupeReturnTab);
    },
    [handleLoupeBoundsChange, loupeReturnTab, setActiveTab],
  );

  const handleLoupeBack = useCallback(() => {
    setActiveTab(loupeReturnTab);
  }, [loupeReturnTab, setActiveTab]);

  const activeLine = sync.lines[sync.activeLineIndex];
  const lineNumber = sync.lines.length > 0 ? sync.activeLineIndex + 1 : 0;
  const wordNumber =
    activeLine && activeLine.words.length > 0 ? sync.activeWordIndex + 1 : 0;

  const subtitle =
    activeTab === 'word' && activeLine
      ? `Línea ${lineNumber} · palabra ${wordNumber} de ${activeLine.words.length}`
      : project
        ? `${project.artist || 'Sin artista'} · Línea ${lineNumber} de ${sync.lines.length}`
        : 'Sin proyecto activo';

  const showTopHeader = activeTab !== 'catalog' && activeTab !== 'loupe';
  const showNavBar = activeTab !== 'loupe';
  const navActiveId: 'catalog' | 'lyrics' | 'sync' | 'export' =
    activeTab === 'word' || activeTab === 'loupe' ? 'sync' : activeTab;

  return (
    <div className="min-h-dvh w-full bg-bg text-ink flex justify-center pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div className="w-full max-w-[430px] h-dvh flex flex-col overflow-hidden bg-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="px-4 pt-2 empty:hidden">
          <UpdateBanner updateAvailable={updateAvailable} onUpdate={applyUpdate} />
          <RestoreNoticeBanner message={restoreNotice ?? restoreError} />
        </div>
        {showTopHeader ? (
          <MobileHeader
            title={project?.title || 'LRC Studio'}
            subtitle={subtitle}
            saveStatus={saveStatus}
            onOpenCatalog={handleOpenCatalogFromHeader}
            onRetrySave={handleRetrySave}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenInfo={() => setInfoOpen(true)}
          />
        ) : null}

        <ScrollShadow
          as="main"
          className="flex-1 min-h-0"
          disabled={activeTab === 'sync' || activeTab === 'word' || activeTab === 'loupe' || activeTab === 'catalog'}
          contentClassName={`px-4 flex flex-col ${
            activeTab === 'sync' || activeTab === 'word' || activeTab === 'loupe'
              ? 'pb-1.5 [@media(max-height:720px)]:pb-1'
              : 'pb-3 [@media(max-height:720px)]:pb-1.5'
          }`}
        >
          {activeTab === 'catalog' ? (
            <CatalogPanel
              projects={catalog.projects}
              unrestorable={catalog.unrestorable}
              onDownloadOriginal={async (id) => {
                const raw = await catalog.exportRawProject(id);
                if (raw) {
                  downloadTextFile(raw.fileName, raw.json, 'application/json;charset=utf-8');
                }
              }}
              activeProjectId={project?.id ?? null}
              loading={catalog.loading}
              error={catalog.error}
              onOpen={async (id) => {
                await openProject(id);
                setActiveTab('sync');
              }}
              onCreate={async () => {
                await createProject();
                setActiveTab('sync');
              }}
              onDuplicate={async (id) => {
                await catalog.duplicateProject(id);
              }}
              onExportBackup={async (id) => {
                const backup = await catalog.exportProjectBackup(id);
                if (backup) {
                  downloadTextFile(
                    backup.fileName,
                    backup.json,
                    'application/json;charset=utf-8',
                  );
                }
              }}
              onImportBackup={catalog.importBackup}
              onDelete={async (id) => {
                if (id === project?.id) {
                  await clearActiveProject();
                }
                await catalog.deleteProject(id);
              }}
              onClose={() => setActiveTab('sync')}
            />
          ) : null}

          {activeTab === 'lyrics' ? (
            <LyricsScreen
              title={project?.title ?? ''}
              artist={project?.artist ?? ''}
              rawText={sync.lines.map((l) => l.text).join('\n')}
              existingLines={sync.lines}
              onTitleChange={async (title) => {
                if (!project) {
                  await createProject({ title, artist: '' });
                  return;
                }
                updateProjectMetadata({ title });
              }}
              onArtistChange={async (artist) => {
                if (!project) {
                  await createProject({ title: 'Sin título', artist });
                  return;
                }
                updateProjectMetadata({ artist });
              }}
              onApply={async (rawText) => {
                if (!project) {
                  await createProject();
                }
                const merged = mergeRawTextWithExistingLines(rawText, sync.lines);
                sync.replaceLines(merged);
              }}
            />
          ) : null}

          {activeTab === 'sync' && syncSubView === 'karaoke' ? (
            <KaraokePreview
              hasAudio={Boolean(audioUrl)}
              durationMs={durationMs}
              isPlaying={player.isPlaying}
              lines={sync.lines}
              syncMode="karaoke"
              timeStore={player.timeStore}
              pausedTimeMs={player.timeStore ? -1 : player.currentTime}
              getCurrentTimeMs={getCurrentTimeMs}
              onSelectMode={handleSelectMode}
              onTogglePlay={togglePlay}
              onSeek={seekTo}
              onUploadAudio={handleUploadAudio}
            />
          ) : null}

          {activeTab === 'sync' && syncSubView !== 'karaoke' ? (
            <LineSyncScreen
              hasAudio={Boolean(audioUrl)}
              peaks={waveformPeaks}
              timeStore={player.timeStore}
              getCurrentTimeMs={getCurrentTimeMs}
              currentTimeMs={fallbackCurrentTimeMs}
              latencyMs={latencyMs}
              durationMs={durationMs}
              isPlaying={player.isPlaying}
              playbackRate={player.playbackRate}
              lines={sync.lines}
              activeLineIndex={sync.activeLineIndex}
              playingLineIndex={playingLineIndex}
              trackedListIndex={trackedListIndex}
              syncMode="line"
              onSelectMode={handleSelectMode}
              onSeek={player.seekTo}
              onSeekStart={handleSeekStart}
              onSeekEnd={handleSeekEnd}
              onTogglePlay={player.togglePlay}
              onChangePlaybackRate={handleChangePlaybackRate}
              onSelectLine={handleSelectLine}
              onPlayFromLine={handlePlayFromLine}
              onClearLineMark={sync.clearLineMark}
              onStampLine={handleStampLine}
              onOpenLoupe={handleOpenLoupe}
              onUploadAudio={handleUploadAudio}
            />
          ) : null}

          {activeTab === 'word' ? (
            <WordSyncScreen
              hasAudio={Boolean(audioUrl)}
              peaks={waveformPeaks}
              timeStore={player.timeStore}
              getCurrentTimeMs={getCurrentTimeMs}
              currentTimeMs={fallbackCurrentTimeMs}
              latencyMs={latencyMs}
              durationMs={durationMs}
              isPlaying={player.isPlaying}
              lines={sync.lines}
              activeLineIndex={sync.activeLineIndex}
              activeWordIndex={sync.activeWordIndex}
              preRollMs={preRollMs}
              syncMode="word"
              onSelectMode={handleSelectMode}
              onSeek={player.seekTo}
              onSeekStart={handleSeekStart}
              onSeekEnd={handleSeekEnd}
              onPlay={player.play}
              onStampWordStart={handleStampWord}
              onSelectWord={handleSelectWord}
              onUndoWord={handleWordUndo}
              canUndoWord={canUndoWord}
              onOpenLoupe={handleOpenLoupe}
              onUploadAudio={handleUploadAudio}
            />
          ) : null}

          {activeTab === 'loupe' && activeLine ? (
            <MobileLoupeBridge
              peaks={waveformPeaks}
              durationMs={durationMs}
              timeStore={player.timeStore ?? null}
              fallbackTimeMs={fallbackCurrentTimeMs}
              line={activeLine}
              lineIndex={sync.activeLineIndex}
              lines={sync.lines}
              isSaved={saveStatus === 'saved' || saveStatus === 'idle'}
              onChange={handleLoupeBoundsChange}
              onPlayLine={handleLoupePlayLine}
              onApply={handleLoupeApply}
              onBack={handleLoupeBack}
            />
          ) : null}

          {activeTab === 'export' ? (
            project ? (
              <ExportScreen project={project} onImport={handleImportJson} />
            ) : (
              <div className="flex-1 flex flex-col justify-center items-center text-center p-6 gap-2">
                <p className="m-0 text-sm font-bold text-mute">
                  Abre o crea una transcripción para exportar sus marcas LRC, ELRC o JSON.
                </p>
              </div>
            )
          ) : null}
        </ScrollShadow>

        {showNavBar ? (
          <NavBar
            items={NAV_ITEMS}
            activeId={navActiveId}
            onSelect={handleNavSelect}
            className="pt-1.5 pb-2.5 [&>button]:min-h-[48px] [@media(max-height:720px)]:pt-1 [@media(max-height:720px)]:pb-1.5 [@media(max-height:720px)]:[&>button]:min-h-[44px]"
          />
        ) : null}
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
      </div>
    </div>
  );
}
