export {
  nudgeLineTime,
  stampLineEnd,
  stampLineStart,
  undoLineSync,
  type LineSyncResult,
  type UndoLineSyncResult,
} from '@/features/sync/model/lineSync';
export {
  distributeWordsEvenlyInLine,
  nudgeWordTime,
} from '@/features/sync/model/wordAdjust';
export {
  stampWordEndOnRelease,
  stampWordStart,
  type StampWordParams,
  type WordSyncResult,
} from '@/features/sync/model/wordSync';
export {
  DEFAULT_POST_ROLL_MS,
  DEFAULT_PRE_ROLL_MS,
  computePreRollStartMs,
  computeSyncProgress,
  findActiveLineIndex,
  findActiveWordIndex,
  getActiveLineWindow,
  getPreRollTrafficLight,
  type ActiveLineWindowOptions,
} from '@/features/sync/model/playbackAnalysis';
export {
  MAX_SYNC_HISTORY,
  popSyncHistory,
  pushSyncHistory,
  type SyncSnapshot,
} from '@/features/sync/model/history';
export {
  useAudioPlayer,
  type UseAudioPlayerOptions,
  type UseAudioPlayerReturn,
} from '@/features/sync/hooks/useAudioPlayer';
export {
  useSyncEngine,
  type UseSyncEngineOptions,
  type UseSyncEngineReturn,
} from '@/features/sync/hooks/useSyncEngine';
