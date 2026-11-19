export {
  INITIAL_DEMO_LYRICS,
  buildStructuredLinesFromText,
  mergeRawTextWithExistingLines,
  splitLineIntoWords,
  splitRawTextIntoLines,
} from '@/features/lyrics/model/lyricsParser';
export {
  LyricsScreen,
  type LyricsScreenProps,
} from '@/features/lyrics/components/LyricsScreen';
export {
  countLyricsStats,
  estimateLyricsApplyImpact,
  type LyricsApplyImpact,
  type LyricsStats,
} from '@/features/lyrics/components/lyricsStats';
