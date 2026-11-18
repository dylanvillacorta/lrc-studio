import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { PlaybackTimeStore } from '@/features/sync/hooks/playbackTimeStore';
import {
  findActiveLineIndex,
  resolvePlaybackTracking,
} from '@/features/sync/model/playbackAnalysis';
import type { LyricLine } from '@/types';

export interface UsePlaybackLineTrackingOptions {
  lines: readonly LyricLine[];
  isPlaying: boolean;
  activeLineIndex: number;
  timeStore?: PlaybackTimeStore | null;
  fallbackCurrentTimeMs?: number;
  setActiveLineIndex: (index: number) => void;
  setActiveWordIndex: (index: number) => void;
  seekTo: (targetMs: number) => void;
}

export interface UsePlaybackLineTrackingReturn {
  playingLineIndex: number;
  trackedListIndex: number;
  selectLine: (index: number) => void;
}

/**
 * Coordina el seguimiento automático de la línea en reproducción suscribiéndose a
 * `PlaybackTimeStore` mediante `useSyncExternalStore`, de modo que React solo re-renderiza
 * cuando cambia el índice de la línea activa (nunca por fotograma).
 */
export function usePlaybackLineTracking({
  lines,
  isPlaying,
  activeLineIndex,
  timeStore = null,
  fallbackCurrentTimeMs = 0,
  setActiveLineIndex,
  setActiveWordIndex,
  seekTo,
}: UsePlaybackLineTrackingOptions): UsePlaybackLineTrackingReturn {
  const [manualOverrideAtPlayingIndex, setManualOverrideAtPlayingIndex] =
    useState<number | null>(null);
  const lastPlayingLineRef = useRef<number>(-1);

  const subscribePlayingLine = useCallback(
    (onStoreChange: () => void) => {
      if (!isPlaying || !timeStore) {
        return () => {};
      }
      return timeStore.subscribe(onStoreChange);
    },
    [isPlaying, timeStore],
  );

  const getPlayingLineSnapshot = useCallback(() => {
    if (!isPlaying) {
      return -1;
    }
    const currentMs = timeStore ? timeStore.getTimeMs() : fallbackCurrentTimeMs;
    return findActiveLineIndex(lines, currentMs);
  }, [fallbackCurrentTimeMs, isPlaying, lines, timeStore]);

  const playingLineIndex = useSyncExternalStore(
    subscribePlayingLine,
    getPlayingLineSnapshot,
    getPlayingLineSnapshot,
  );

  const isManualOverrideActive =
    manualOverrideAtPlayingIndex !== null &&
    manualOverrideAtPlayingIndex === playingLineIndex;
  const trackedListIndex =
    isManualOverrideActive || playingLineIndex < 0
      ? activeLineIndex
      : playingLineIndex;

  useEffect(() => {
    const currentMs = timeStore ? timeStore.getTimeMs() : fallbackCurrentTimeMs;
    const res = resolvePlaybackTracking({
      lines,
      currentTimeMs: currentMs,
      isPlaying,
      activeLineIndex,
      lastPlayingLineIndex: lastPlayingLineRef.current,
      manualOverrideAtPlayingIndex: isManualOverrideActive
        ? manualOverrideAtPlayingIndex
        : null,
    });
    lastPlayingLineRef.current = res.playingLineIndex;
    if (res.nextActiveLineIndex !== null && res.nextActiveLineIndex !== activeLineIndex) {
      setActiveLineIndex(res.nextActiveLineIndex);
    }
  }, [
    activeLineIndex,
    fallbackCurrentTimeMs,
    isManualOverrideActive,
    isPlaying,
    lines,
    manualOverrideAtPlayingIndex,
    playingLineIndex,
    setActiveLineIndex,
    timeStore,
  ]);

  const selectLine = useCallback(
    (index: number) => {
      setManualOverrideAtPlayingIndex(isPlaying ? playingLineIndex : null);
      setActiveLineIndex(index);
      setActiveWordIndex(0);
      const selected = lines[index];
      if (selected && selected.startMs !== null) {
        seekTo(selected.startMs);
      }
    },
    [isPlaying, lines, playingLineIndex, seekTo, setActiveLineIndex, setActiveWordIndex],
  );

  return useMemo(
    () => ({
      playingLineIndex,
      trackedListIndex,
      selectLine,
    }),
    [playingLineIndex, selectLine, trackedListIndex],
  );
}
