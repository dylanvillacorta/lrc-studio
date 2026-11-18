import { memo } from 'react';
import { WaveformStrip } from '@/features/sync/components/WaveformStrip';
import { getNextPlaybackRate } from '@/features/sync/components/syncViewHelpers';
import {
  usePlaybackTime,
  type PlaybackTimeStore,
} from '@/features/sync/hooks/playbackTimeStore';
import { formatTime } from '@/lib/time';
import type { LyricLine } from '@/types';
import { Icon, IconButton, WellPanel } from '@/ui';

export interface DesktopWaveformCardProps {
  peaks: readonly number[];
  timeStore?: PlaybackTimeStore | null;
  getCurrentTimeMs?: () => number;
  currentTimeMs?: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
  lines: readonly LyricLine[];
  canUndo: boolean;
  canOpenLoupe: boolean;
  onSeek: (targetMs: number) => void;
  onTogglePlay: () => void;
  onChangePlaybackRate: (rate: number) => void;
  onUndo: () => void;
  onOpenLoupe: () => void;
}

const PlaybackTimeLabel = memo(function PlaybackTimeLabel({
  timeStore,
  fallbackTimeMs,
}: {
  timeStore: PlaybackTimeStore | null;
  fallbackTimeMs: number;
}) {
  const effectiveTimeMs = usePlaybackTime(timeStore, fallbackTimeMs, 33);
  return (
    <span className="font-mono text-xs font-bold text-mute tabular-nums">
      {formatTime(effectiveTimeMs)}
    </span>
  );
});

/**
 * Tarjeta superior del centro en escritorio con onda amplia y controles de transporte.
 */
export const DesktopWaveformCard = memo(function DesktopWaveformCard({
  peaks,
  timeStore = null,
  getCurrentTimeMs,
  currentTimeMs = 0,
  durationMs,
  isPlaying,
  playbackRate,
  lines,
  canUndo,
  canOpenLoupe,
  onSeek,
  onTogglePlay,
  onChangePlaybackRate,
  onUndo,
  onOpenLoupe,
}: DesktopWaveformCardProps) {
  const readCurrentTimeMs = () =>
    getCurrentTimeMs ? getCurrentTimeMs() : timeStore ? timeStore.getTimeMs() : currentTimeMs;

  return (
    <WellPanel className="px-4 py-3.5 flex flex-col gap-2.5">
      <WaveformStrip
        peaks={peaks}
        timeStore={timeStore}
        currentTimeMs={currentTimeMs}
        durationMs={durationMs}
        lines={lines}
        onSeek={onSeek}
        onOpenLoupe={onOpenLoupe}
        canOpenLoupe={canOpenLoupe}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PlaybackTimeLabel timeStore={timeStore} fallbackTimeMs={currentTimeMs} />

        <div className="flex items-center gap-2.5">
          <IconButton
            aria-label={`Velocidad ${playbackRate}x`}
            onClick={() => onChangePlaybackRate(getNextPlaybackRate(playbackRate))}
            className="font-mono text-xs font-extrabold"
          >
            <span>{`${playbackRate}×`}</span>
          </IconButton>

          <IconButton
            round
            aria-label="Retroceder 5 segundos"
            onClick={() => onSeek(Math.max(0, readCurrentTimeMs() - 5000))}
          >
            <Icon name="rewind" size={20} />
          </IconButton>

          <IconButton
            round
            size="xl"
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            onClick={onTogglePlay}
            className="text-acc"
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={26} />
          </IconButton>

          <IconButton
            round
            aria-label="Adelantar 5 segundos"
            onClick={() => onSeek(Math.min(durationMs, readCurrentTimeMs() + 5000))}
          >
            <Icon name="forward" size={20} />
          </IconButton>

          <IconButton
            aria-label="Deshacer última marca"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Icon name="undo" size={20} />
          </IconButton>
        </div>

        <span className="font-mono text-xs font-bold text-mute tabular-nums">
          {formatTime(durationMs)}
        </span>
      </div>
    </WellPanel>
  );
});
