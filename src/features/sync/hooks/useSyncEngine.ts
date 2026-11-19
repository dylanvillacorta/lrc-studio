/**
 * Hook de motor de sincronización de líneas y palabras con historial para deshacer.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * estado de líneas y acciones de sincronización (líneas 250-258 y 748-1081).
 *
 * No realiza llamadas a storage; notifica cambios mediante `onChange` para que
 * la capa de sesión/autoguardado (T6) persista el estado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createSyncHistoryState,
  recordSyncHistory,
  redoSyncHistory,
  undoSyncHistory,
  type SyncHistoryState,
  type SyncSnapshot,
} from '@/features/sync/model/history';
import {
  clearLineMark as clearLineMarkPure,
  clearMarksFromLine as clearMarksFromLinePure,
  nudgeLineTime,
  setLineStartTime as setLineStartTimePure,
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
  canRedo: boolean;
  progress: SyncProgress;
  setActiveLineIndex: (index: number) => void;
  setActiveWordIndex: (index: number) => void;
  replaceLines: (nextLines: LyricLine[], recordHistory?: boolean) => void;
  stampLineStart: (nowMs: number, lineHoldMode?: boolean) => void;
  stampLineEnd: (nowMs: number, advanceAfter?: boolean) => void;
  clearLineMark: (lineIndex: number) => void;
  clearMarksFromLine: (fromLineIndex: number) => void;
  setLineStartTime: (lineIndex: number, startMs: number) => void;
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
  redo: () => boolean;
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
  const [activeLineIndex, setActiveLineIndexState] = useState(initialLineIndex);
  const [activeWordIndex, setActiveWordIndexState] = useState(initialWordIndex);
  const [history, setHistory] = useState<SyncHistoryState>(() => createSyncHistoryState());

  const linesRef = useRef(lines);
  const activeLineIndexRef = useRef(activeLineIndex);
  const activeWordIndexRef = useRef(activeWordIndex);
  const historyRef = useRef(history);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    activeLineIndexRef.current = activeLineIndex;
  }, [activeLineIndex]);

  useEffect(() => {
    activeWordIndexRef.current = activeWordIndex;
  }, [activeWordIndex]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const setActiveLineIndex = useCallback((index: number) => {
    activeLineIndexRef.current = index;
    setActiveLineIndexState(index);
  }, []);

  const setActiveWordIndex = useCallback((index: number) => {
    activeWordIndexRef.current = index;
    setActiveWordIndexState(index);
  }, []);

  const commitLines = useCallback(
    (
      nextLines: LyricLine[],
      nextLineIdx = activeLineIndexRef.current,
      nextWordIdx = activeWordIndexRef.current,
      recordHistory = true,
    ) => {
      if (recordHistory) {
        const snapshot: SyncSnapshot = {
          lines: linesRef.current,
          activeLineIndex: activeLineIndexRef.current,
          activeWordIndex: activeWordIndexRef.current,
        };
        setHistory((prev) => {
          const updated = recordSyncHistory(prev, snapshot);
          historyRef.current = updated;
          return updated;
        });
      }
      linesRef.current = nextLines;
      activeLineIndexRef.current = nextLineIdx;
      activeWordIndexRef.current = nextWordIdx;
      setLines(nextLines);
      setActiveLineIndexState(nextLineIdx);
      setActiveWordIndexState(nextWordIdx);
      onChangeRef.current?.(nextLines);
    },
    [],
  );

  const replaceLines = useCallback(
    (nextLines: LyricLine[], recordHistory = true) => {
      const clampedLine = Math.max(
        0,
        Math.min(Math.max(0, nextLines.length - 1), activeLineIndexRef.current),
      );
      commitLines(nextLines, clampedLine, 0, recordHistory);
    },
    [commitLines],
  );

  const handleStampLineStart = useCallback(
    (nowMs: number, lineHoldMode = false) => {
      const result = stampLineStart(
        linesRef.current,
        activeLineIndexRef.current,
        nowMs,
        lineHoldMode,
      );
      commitLines(result.lines, result.nextLineIndex, activeWordIndexRef.current);
    },
    [commitLines],
  );

  const handleStampLineEnd = useCallback(
    (nowMs: number, advanceAfter = false) => {
      const result = stampLineEnd(
        linesRef.current,
        activeLineIndexRef.current,
        nowMs,
        advanceAfter,
      );
      commitLines(result.lines, result.nextLineIndex, activeWordIndexRef.current);
    },
    [commitLines],
  );

  const handleUndoLine = useCallback(
    (currentTimeMs: number): number => {
      const result = undoLineSync(
        linesRef.current,
        activeLineIndexRef.current,
        currentTimeMs,
      );
      commitLines(result.lines, result.nextLineIndex, 0);
      return result.rewindTargetMs;
    },
    [commitLines],
  );

  const clearLineMark = useCallback(
    (lineIndex: number) => {
      const result = clearLineMarkPure(linesRef.current, lineIndex);
      commitLines(result.lines, result.nextLineIndex, 0);
    },
    [commitLines],
  );

  const clearMarksFromLine = useCallback(
    (fromLineIndex: number) => {
      const result = clearMarksFromLinePure(linesRef.current, fromLineIndex);
      commitLines(result.lines, result.nextLineIndex, 0);
    },
    [commitLines],
  );

  const setLineStartTime = useCallback(
    (lineIndex: number, startMs: number) => {
      if (!linesRef.current[lineIndex]) {
        return;
      }
      const next = setLineStartTimePure(linesRef.current, lineIndex, startMs);
      commitLines(next, lineIndex, 0);
    },
    [commitLines],
  );

  const handleStampWordStart = useCallback(
    (params: {
      nowMs: number;
      subMode: WordSyncSubMode;
      sniperHoldDuration?: boolean;
      sniperAutoAdvancePreRoll?: boolean;
    }) => {
      const result = stampWordStart(linesRef.current, {
        lineIndex: activeLineIndexRef.current,
        wordIndex: activeWordIndexRef.current,
        ...params,
      });
      commitLines(result.lines, result.nextLineIndex, result.nextWordIndex);
      return {
        shouldPause: result.shouldPause,
        shouldRewindPreRoll: result.shouldRewindPreRoll,
        completedLine: result.completedLine,
      };
    },
    [commitLines],
  );

  const handleStampWordEnd = useCallback(
    (params: {
      nowMs: number;
      subMode: WordSyncSubMode;
      sniperHoldDuration?: boolean;
      sniperAutoAdvancePreRoll?: boolean;
    }) => {
      const result = stampWordEndOnRelease(linesRef.current, {
        lineIndex: activeLineIndexRef.current,
        wordIndex: activeWordIndexRef.current,
        ...params,
      });
      commitLines(result.lines, result.nextLineIndex, result.nextWordIndex);
      return {
        shouldPause: result.shouldPause,
        shouldRewindPreRoll: result.shouldRewindPreRoll,
        completedLine: result.completedLine,
      };
    },
    [commitLines],
  );

  const distributeWordsInLine = useCallback(
    (lineIndex: number, fallbackStartMs = 0) => {
      const target = linesRef.current[lineIndex];
      if (!target || target.words.length === 0) {
        return;
      }
      const next = distributeWordsEvenlyInLine(
        linesRef.current,
        lineIndex,
        fallbackStartMs,
      );
      commitLines(next);
    },
    [commitLines],
  );

  const nudgeWord = useCallback(
    (
      lineIndex: number,
      wordIndex: number,
      field: 'startMs' | 'endMs',
      deltaMs: number,
    ) => {
      if (!linesRef.current[lineIndex]?.words[wordIndex]) {
        return;
      }
      const next = nudgeWordTime(
        linesRef.current,
        lineIndex,
        wordIndex,
        field,
        deltaMs,
      );
      commitLines(next);
    },
    [commitLines],
  );

  const nudgeLine = useCallback(
    (lineIndex: number, field: 'startMs' | 'endMs', deltaMs: number) => {
      if (!linesRef.current[lineIndex]) {
        return;
      }
      const next = nudgeLineTime(linesRef.current, lineIndex, field, deltaMs);
      commitLines(next);
    },
    [commitLines],
  );

  const undo = useCallback((): boolean => {
    const current: SyncSnapshot = {
      lines: linesRef.current,
      activeLineIndex: activeLineIndexRef.current,
      activeWordIndex: activeWordIndexRef.current,
    };
    const { snapshot, state: nextHistory } = undoSyncHistory(historyRef.current, current);
    if (!snapshot) {
      return false;
    }
    historyRef.current = nextHistory;
    linesRef.current = snapshot.lines;
    activeLineIndexRef.current = snapshot.activeLineIndex;
    activeWordIndexRef.current = snapshot.activeWordIndex;
    setHistory(nextHistory);
    setLines(snapshot.lines);
    setActiveLineIndexState(snapshot.activeLineIndex);
    setActiveWordIndexState(snapshot.activeWordIndex);
    onChangeRef.current?.(snapshot.lines);
    return true;
  }, []);

  const redo = useCallback((): boolean => {
    const current: SyncSnapshot = {
      lines: linesRef.current,
      activeLineIndex: activeLineIndexRef.current,
      activeWordIndex: activeWordIndexRef.current,
    };
    const { snapshot, state: nextHistory } = redoSyncHistory(historyRef.current, current);
    if (!snapshot) {
      return false;
    }
    historyRef.current = nextHistory;
    linesRef.current = snapshot.lines;
    activeLineIndexRef.current = snapshot.activeLineIndex;
    activeWordIndexRef.current = snapshot.activeWordIndex;
    setHistory(nextHistory);
    setLines(snapshot.lines);
    setActiveLineIndexState(snapshot.activeLineIndex);
    setActiveWordIndexState(snapshot.activeWordIndex);
    onChangeRef.current?.(snapshot.lines);
    return true;
  }, []);

  const resetHistory = useCallback(() => {
    const empty = createSyncHistoryState();
    historyRef.current = empty;
    setHistory(empty);
  }, []);

  const progress = useMemo(() => computeSyncProgress(lines), [lines]);
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  return useMemo<UseSyncEngineReturn>(
    () => ({
      lines,
      activeLineIndex,
      activeWordIndex,
      canUndo,
      canRedo,
      progress,
      setActiveLineIndex,
      setActiveWordIndex,
      replaceLines,
      stampLineStart: handleStampLineStart,
      stampLineEnd: handleStampLineEnd,
      clearLineMark,
      clearMarksFromLine,
      setLineStartTime,
      undoLine: handleUndoLine,
      stampWordStart: handleStampWordStart,
      stampWordEnd: handleStampWordEnd,
      distributeWordsInLine,
      nudgeWord,
      nudgeLine,
      undo,
      redo,
      resetHistory,
    }),
    [
      activeLineIndex,
      activeWordIndex,
      canRedo,
      canUndo,
      clearLineMark,
      clearMarksFromLine,
      distributeWordsInLine,
      handleStampLineEnd,
      handleStampLineStart,
      handleStampWordEnd,
      handleStampWordStart,
      handleUndoLine,
      lines,
      nudgeLine,
      nudgeWord,
      progress,
      redo,
      replaceLines,
      resetHistory,
      setActiveLineIndex,
      setActiveWordIndex,
      setLineStartTime,
      undo,
    ],
  );
}
