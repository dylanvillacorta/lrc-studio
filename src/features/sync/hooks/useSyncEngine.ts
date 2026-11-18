/**
 * Hook de motor de sincronización de líneas y palabras con historial para deshacer.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * estado de líneas y acciones de sincronización (líneas 250-258 y 748-1081).
 *
 * No realiza llamadas a storage; notifica cambios mediante `onChange` para que
 * la capa de sesión/autoguardado (T6) persista el estado.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  popSyncHistory,
  pushSyncHistory,
  type SyncSnapshot,
} from '@/features/sync/model/history';
import {
  nudgeLineTime,
  stampLineEnd,
  stampLineStart,
  undoLineSync,
} from '@/features/sync/model/lineSync';
import { computeSyncProgress } from '@/features/sync/model/playbackAnalysis';
import {
  distributeWordsEvenlyInLine,
  nudgeWordTime,
} from '@/features/sync/model/wordAdjust';
import {
  stampWordEndOnRelease,
  stampWordStart,
} from '@/features/sync/model/wordSync';
import type { LyricLine, SyncProgress, WordSyncSubMode } from '@/types';

export interface UseSyncEngineOptions {
  initialLines?: LyricLine[];
  initialLineIndex?: number;
  initialWordIndex?: number;
  onChange?: (lines: LyricLine[]) => void;
}

export interface UseSyncEngineReturn {
  lines: LyricLine[];
  activeLineIndex: number;
  activeWordIndex: number;
  canUndo: boolean;
  progress: SyncProgress;
  setActiveLineIndex: (index: number) => void;
  setActiveWordIndex: (index: number) => void;
  replaceLines: (nextLines: LyricLine[], recordHistory?: boolean) => void;
  stampLineStart: (nowMs: number, lineHoldMode?: boolean) => void;
  stampLineEnd: (nowMs: number, advanceAfter?: boolean) => void;
  undoLine: (currentTimeMs: number) => number;
  stampWordStart: (params: {
    nowMs: number;
    subMode: WordSyncSubMode;
    sniperHoldDuration?: boolean;
    sniperAutoAdvancePreRoll?: boolean;
  }) => { shouldPause: boolean; shouldRewindPreRoll: boolean; completedLine: boolean };
  stampWordEnd: (params: {
    nowMs: number;
    subMode: WordSyncSubMode;
    sniperHoldDuration?: boolean;
    sniperAutoAdvancePreRoll?: boolean;
  }) => { shouldPause: boolean; shouldRewindPreRoll: boolean; completedLine: boolean };
  distributeWordsInLine: (lineIndex: number, fallbackStartMs?: number) => void;
  nudgeWord: (
    lineIndex: number,
    wordIndex: number,
    field: 'startMs' | 'endMs',
    deltaMs: number,
  ) => void;
  nudgeLine: (lineIndex: number, field: 'startMs' | 'endMs', deltaMs: number) => void;
  undo: () => boolean;
  resetHistory: () => void;
}

export function useSyncEngine(
  options: UseSyncEngineOptions = {},
): UseSyncEngineReturn {
  const {
    initialLines = [],
    initialLineIndex = 0,
    initialWordIndex = 0,
    onChange,
  } = options;

  const [lines, setLines] = useState<LyricLine[]>(initialLines);
  const [activeLineIndex, setActiveLineIndex] = useState(initialLineIndex);
  const [activeWordIndex, setActiveWordIndex] = useState(initialWordIndex);
  const [history, setHistory] = useState<SyncSnapshot[]>([]);

  const commitLines = useCallback(
    (
      nextLines: LyricLine[],
      nextLineIdx = activeLineIndex,
      nextWordIdx = activeWordIndex,
      recordHistory = true,
    ) => {
      if (recordHistory) {
        setHistory((prev) =>
          pushSyncHistory(prev, {
            lines,
            activeLineIndex,
            activeWordIndex,
          }),
        );
      }
      setLines(nextLines);
      setActiveLineIndex(nextLineIdx);
      setActiveWordIndex(nextWordIdx);
      onChange?.(nextLines);
    },
    [activeLineIndex, activeWordIndex, lines, onChange],
  );

  const replaceLines = useCallback(
    (nextLines: LyricLine[], recordHistory = true) => {
      const clampedLine = Math.max(
        0,
        Math.min(Math.max(0, nextLines.length - 1), activeLineIndex),
      );
      commitLines(nextLines, clampedLine, 0, recordHistory);
    },
    [activeLineIndex, commitLines],
  );

  const handleStampLineStart = useCallback(
    (nowMs: number, lineHoldMode = false) => {
      const result = stampLineStart(lines, activeLineIndex, nowMs, lineHoldMode);
      commitLines(result.lines, result.nextLineIndex, activeWordIndex);
    },
    [activeLineIndex, activeWordIndex, commitLines, lines],
  );

  const handleStampLineEnd = useCallback(
    (nowMs: number, advanceAfter = false) => {
      const result = stampLineEnd(lines, activeLineIndex, nowMs, advanceAfter);
      commitLines(result.lines, result.nextLineIndex, activeWordIndex);
    },
    [activeLineIndex, activeWordIndex, commitLines, lines],
  );

  const handleUndoLine = useCallback(
    (currentTimeMs: number): number => {
      const result = undoLineSync(lines, activeLineIndex, currentTimeMs);
      commitLines(result.lines, result.nextLineIndex, 0);
      return result.rewindTargetMs;
    },
    [activeLineIndex, commitLines, lines],
  );

  const handleStampWordStart = useCallback(
    (params: {
      nowMs: number;
      subMode: WordSyncSubMode;
      sniperHoldDuration?: boolean;
      sniperAutoAdvancePreRoll?: boolean;
    }) => {
      const result = stampWordStart(lines, {
        lineIndex: activeLineIndex,
        wordIndex: activeWordIndex,
        ...params,
      });
      commitLines(result.lines, result.nextLineIndex, result.nextWordIndex);
      return {
        shouldPause: result.shouldPause,
        shouldRewindPreRoll: result.shouldRewindPreRoll,
        completedLine: result.completedLine,
      };
    },
    [activeLineIndex, activeWordIndex, commitLines, lines],
  );

  const handleStampWordEnd = useCallback(
    (params: {
      nowMs: number;
      subMode: WordSyncSubMode;
      sniperHoldDuration?: boolean;
      sniperAutoAdvancePreRoll?: boolean;
    }) => {
      const result = stampWordEndOnRelease(lines, {
        lineIndex: activeLineIndex,
        wordIndex: activeWordIndex,
        ...params,
      });
      commitLines(result.lines, result.nextLineIndex, result.nextWordIndex);
      return {
        shouldPause: result.shouldPause,
        shouldRewindPreRoll: result.shouldRewindPreRoll,
        completedLine: result.completedLine,
      };
    },
    [activeLineIndex, activeWordIndex, commitLines, lines],
  );

  const distributeWordsInLine = useCallback(
    (lineIndex: number, fallbackStartMs = 0) => {
      const next = distributeWordsEvenlyInLine(lines, lineIndex, fallbackStartMs);
      commitLines(next);
    },
    [commitLines, lines],
  );

  const nudgeWord = useCallback(
    (
      lineIndex: number,
      wordIndex: number,
      field: 'startMs' | 'endMs',
      deltaMs: number,
    ) => {
      const next = nudgeWordTime(lines, lineIndex, wordIndex, field, deltaMs);
      commitLines(next);
    },
    [commitLines, lines],
  );

  const nudgeLine = useCallback(
    (lineIndex: number, field: 'startMs' | 'endMs', deltaMs: number) => {
      const next = nudgeLineTime(lines, lineIndex, field, deltaMs);
      commitLines(next);
    },
    [commitLines, lines],
  );

  const undo = useCallback((): boolean => {
    const { snapshot, remaining } = popSyncHistory(history);
    if (!snapshot) {
      return false;
    }
    setHistory(remaining);
    setLines(snapshot.lines);
    setActiveLineIndex(snapshot.activeLineIndex);
    setActiveWordIndex(snapshot.activeWordIndex);
    onChange?.(snapshot.lines);
    return true;
  }, [history, onChange]);

  const resetHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const progress = useMemo(() => computeSyncProgress(lines), [lines]);

  return {
    lines,
    activeLineIndex,
    activeWordIndex,
    canUndo: history.length > 0,
    progress,
    setActiveLineIndex,
    setActiveWordIndex,
    replaceLines,
    stampLineStart: handleStampLineStart,
    stampLineEnd: handleStampLineEnd,
    undoLine: handleUndoLine,
    stampWordStart: handleStampWordStart,
    stampWordEnd: handleStampWordEnd,
    distributeWordsInLine,
    nudgeWord,
    nudgeLine,
    undo,
    resetHistory,
  };
}
