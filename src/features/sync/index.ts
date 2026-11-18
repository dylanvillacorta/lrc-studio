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
  DEFAULT_WORD_SWEEP_MS,
  computeKaraokeState,
  computePreRollStartMs,
  computeSyncProgress,
  computeWordProgressPct,
  findActiveLineIndex,
  findActiveWordIndex,
  getActiveLineWindow,
  getPreRollTrafficLight,
  type ActiveLineWindowOptions,
  type KaraokeLineState,
  type KaraokePlaybackState,
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
export {
  TIMELINE_COLLAPSE_DELAY_MS,
  TIMELINE_SEEK_THROTTLE_MS,
  computeFloatingIndicatorLeftPct,
  computePointerRatio,
  computePointerTimeMs,
  reduceTimelineInteraction,
  shouldThrottleSeek,
  type TimelineInteractionState,
} from '@/features/sync/model/timelineScrub';
export {
  computeBurstEnterState,
  computeBurstExitState,
  getBurstLoopSeekTargetMs,
  type BurstLoopCheckParams,
  type BurstTransitionResult,
} from '@/features/sync/model/burstLoop';
