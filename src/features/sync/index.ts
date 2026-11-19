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
  resolvePlaybackTracking,
  type ActiveLineWindowOptions,
  type KaraokeLineState,
  type KaraokePlaybackState,
  type PlaybackTrackingInput,
  type PlaybackTrackingResult,
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
export {
  MAX_LATENCY_MS,
  clampLatencyMs,
  computeCompensatedStampMs,
  readCurrentTimeMs,
  type CurrentTimeSource,
} from '@/features/sync/model/stampClock';
export {
  BEEP_COUNT,
  BEEP_DURATION_S,
  BEEP_FREQUENCY_HZ,
  BEEP_INITIAL_DELAY_MS,
  BEEP_INTERVAL_MS,
  computeLatencyEstimateFromTaps,
  computeMedian,
} from '@/features/sync/model/latencyCalibration';
export {
  getShiftTimingsPreview,
  shiftTimings,
  type ShiftTimingsPreview,
} from '@/features/sync/model/shiftTimings';
export {
  SyncSettingsDialog,
  type SyncSettingsDialogProps,
} from '@/features/sync/components/SyncSettingsDialog';
