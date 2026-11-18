/**
 * Hook de reproducción de audio a 60 FPS mediante `requestAnimationFrame`.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * bucle `requestAnimationFrame` (líneas 320-335), `seekTo` (línea 338),
 * `togglePlay` (línea 349) y `changeSpeed` (línea 361).
 *
 * `currentTime` y `duration` se expresan en milisegundos.
 * Única fuente de verdad: `audio.currentTime`, protegida por estado `seeking`
 * durante el arrastre o mientras el elemento nativo realiza un seek, y publicada
 * a través de `PlaybackTimeStore` para evitar re-renders globales a 60 FPS.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  createPlaybackTimeStore,
  type PlaybackTimeStore,
} from '@/features/sync/hooks/playbackTimeStore';
import {
  clampTimeMs,
  needsCurrentTimeCorrection,
  resolveDisplayedTimeMs,
  waitForMetadata,
} from '@/features/sync/hooks/audioSeekLogic';

export interface UseAudioPlayerOptions {
  /** Referencia opcional a un `<audio>` montado externamente. */
  audioRef?: RefObject<HTMLAudioElement | null>;
  /** URL opcional del audio cuando no se provee `audioRef` externo. */
  src?: string | null;
  /** Duración inicial en milisegundos antes de cargar metadatos. */
  initialDurationMs?: number;
  /** Velocidad inicial de reproducción (por defecto 1.0). */
  initialPlaybackRate?: number;
}

export interface UseAudioPlayerReturn {
  currentTime: number;
  timeStore?: PlaybackTimeStore;
  getCurrentTimeMs: () => number;
  duration: number;
  isPlaying: boolean;
  isSeeking: boolean;
  playbackRate: number;
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
  seekTo: (targetMs: number) => void;
  setSeeking: (seeking: boolean) => void;
  setPlaybackRate: (rate: number) => void;
}

function publishTestAudioRef(audio: HTMLAudioElement | null): void {
  if (typeof window !== 'undefined') {
    (window as Window & { __lrcAudioElement?: HTMLAudioElement | null }).__lrcAudioElement =
      audio;
  }
}

export function useAudioPlayer(
  options: UseAudioPlayerOptions = {},
): UseAudioPlayerReturn {
  const {
    audioRef: externalRef,
    src = null,
    initialDurationMs = 0,
    initialPlaybackRate = 1.0,
  } = options;

  const internalAudioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const playbackRateRef = useRef(initialPlaybackRate);
  const pendingSeekMsRef = useRef<number | null>(null);
  const isSeekingRef = useRef(false);
  const durationRef = useRef(initialDurationMs);
  const initialDurationRef = useRef(initialDurationMs);
  useEffect(() => {
    initialDurationRef.current = initialDurationMs;
  }, [initialDurationMs]);

  const [timeStore] = useState<PlaybackTimeStore>(() => createPlaybackTimeStore(0));
  const [duration, setDuration] = useState(initialDurationMs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSeeking, setIsSeekingState] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(initialPlaybackRate);

  useEffect(() => {
    if (duration > 0) {
      durationRef.current = duration;
    } else if (initialDurationMs > 0 && durationRef.current === 0) {
      durationRef.current = initialDurationMs;
    }
  }, [duration, initialDurationMs]);

  const getAudioElement = useCallback((): HTMLAudioElement | null => {
    if (externalRef) {
      return externalRef.current;
    }
    return internalAudioRef.current;
  }, [externalRef]);

  const setSeeking = useCallback((seeking: boolean) => {
    isSeekingRef.current = seeking;
    setIsSeekingState(seeking);
  }, []);

  // Crea o actualiza el elemento Audio interno si se usa `src` sin `audioRef` externo.
  useEffect(() => {
    if (externalRef || typeof Audio === 'undefined') {
      return;
    }

    if (!src) {
      if (internalAudioRef.current) {
        internalAudioRef.current.pause();
        internalAudioRef.current.src = '';
        internalAudioRef.current = null;
      }
      publishTestAudioRef(null);
      durationRef.current = initialDurationRef.current;
      pendingSeekMsRef.current = null;
      timeStore.setTimeMs(0);
      return;
    }

    // Al recrear el elemento se restaura la posición mostrada (causa T25:
    // antes el audio nuevo arrancaba en 0 mientras la interfaz seguía en otro tiempo).
    const restoreMs = resolveDisplayedTimeMs(
      pendingSeekMsRef.current,
      timeStore.getTimeMs(),
    );
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.playbackRate = playbackRateRef.current;
    audio.preservesPitch = true;
    if (restoreMs > 0) {
      pendingSeekMsRef.current = restoreMs;
    }
    internalAudioRef.current = audio;
    publishTestAudioRef(audio);

    return () => {
      audio.pause();
      audio.src = '';
      if (internalAudioRef.current === audio) {
        internalAudioRef.current = null;
        publishTestAudioRef(null);
      }
    };
  }, [externalRef, src, timeStore]);

  // Sincroniza eventos del elemento de audio con `audio.currentTime` como fuente única.
  useEffect(() => {
    const audio = getAudioElement();
    if (!audio) {
      return;
    }

    const applyPendingSeekIfReady = () => {
      if (pendingSeekMsRef.current === null || audio.readyState < 1) {
        return;
      }
      const maxDur =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.round(audio.duration * 1000)
          : durationRef.current > 0
            ? durationRef.current
            : Number.MAX_SAFE_INTEGER;
      const clampedPending = Math.max(0, Math.min(maxDur, pendingSeekMsRef.current));
      pendingSeekMsRef.current = null;
      audio.currentTime = clampedPending / 1000;
      timeStore.setTimeMs(clampedPending);
    };

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        const durMs = Math.round(audio.duration * 1000);
        durationRef.current = durMs;
        setDuration(durMs);
      }
      applyPendingSeekIfReady();
    };

    const handleSyncFromAudio = () => {
      if (isSeekingRef.current || audio.seeking || pendingSeekMsRef.current !== null) {
        return;
      }
      timeStore.setTimeMs(audio.currentTime * 1000);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      handleSyncFromAudio();
    };
    const handleEnded = () => {
      setIsPlaying(false);
      timeStore.setTimeMs(audio.currentTime * 1000);
    };

    if (audio.readyState >= 1) {
      handleLoadedMetadata();
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleLoadedMetadata);
    audio.addEventListener('canplay', handleLoadedMetadata);
    audio.addEventListener('seeked', handleSyncFromAudio);
    audio.addEventListener('timeupdate', handleSyncFromAudio);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleLoadedMetadata);
      audio.removeEventListener('seeked', handleSyncFromAudio);
      audio.removeEventListener('timeupdate', handleSyncFromAudio);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [getAudioElement, src, timeStore]);

  // Bucle 60 FPS con requestAnimationFrame mientras reproduce (sin pisar seeks activos).
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const updateClock = () => {
      const audio = getAudioElement();
      if (audio && !audio.paused) {
        if (!isSeekingRef.current && !audio.seeking && pendingSeekMsRef.current === null) {
          timeStore.setTimeMs(audio.currentTime * 1000);
        }
        rafRef.current = requestAnimationFrame(updateClock);
      }
    };

    rafRef.current = requestAnimationFrame(updateClock);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, getAudioElement, timeStore]);

  const play = useCallback(async () => {
    const audio = getAudioElement();
    if (!audio) return;
    audio.playbackRate = playbackRateRef.current;
    // Salvaguarda: el audio debe sonar desde el tiempo mostrado.
    const displayedMs = resolveDisplayedTimeMs(
      pendingSeekMsRef.current,
      timeStore.getTimeMs(),
    );
    if (audio.readyState < 1 && displayedMs > 0) {
      pendingSeekMsRef.current = displayedMs;
      await waitForMetadata(audio);
    }
    if (audio.readyState >= 1) {
      const target = clampTimeMs(
        resolveDisplayedTimeMs(pendingSeekMsRef.current, timeStore.getTimeMs()),
        Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0,
      );
      pendingSeekMsRef.current = null;
      if (needsCurrentTimeCorrection(target, audio.currentTime)) {
        audio.currentTime = target / 1000;
      }
      timeStore.setTimeMs(target);
    }
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [getAudioElement, timeStore]);

  const pause = useCallback(() => {
    const audio = getAudioElement();
    if (!audio) return;
    audio.pause();
    timeStore.setTimeMs(audio.currentTime * 1000);
    setIsPlaying(false);
  }, [getAudioElement, timeStore]);

  const togglePlay = useCallback(() => {
    const audio = getAudioElement();
    if (!audio) return;
    if (audio.paused) {
      void play();
    } else {
      pause();
    }
  }, [getAudioElement, play, pause]);

  const seekTo = useCallback(
    (targetMs: number) => {
      const effectiveDur =
        durationRef.current > 0 ? durationRef.current : Number.MAX_SAFE_INTEGER;
      const clampedMs = Math.max(0, Math.min(effectiveDur, Number(targetMs) || 0));
      const audio = getAudioElement();
      if (audio && audio.readyState >= 1) {
        pendingSeekMsRef.current = null;
        audio.currentTime = clampedMs / 1000;
      } else {
        pendingSeekMsRef.current = clampedMs;
      }
      timeStore.setTimeMs(clampedMs);
    },
    [getAudioElement, timeStore],
  );

  const getCurrentTimeMs = useCallback((): number => {
    if (pendingSeekMsRef.current !== null) {
      return Math.round(pendingSeekMsRef.current);
    }
    const audio = getAudioElement();
    if (audio && audio.readyState >= 1 && !isSeekingRef.current && !audio.seeking) {
      return Math.round(audio.currentTime * 1000);
    }
    return timeStore.getTimeMs();
  }, [getAudioElement, timeStore]);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const safeRate = Math.max(0.25, Math.min(2.0, rate));
      playbackRateRef.current = safeRate;
      setPlaybackRateState(safeRate);
      const audio = getAudioElement();
      if (audio) {
        audio.playbackRate = safeRate;
        audio.preservesPitch = true;
      }
    },
    [getAudioElement],
  );

  const hasSource = externalRef !== undefined || Boolean(src);
  const effectiveDuration = !hasSource
    ? initialDurationMs
    : duration > 0
      ? duration
      : initialDurationMs;
  const effectiveIsPlaying = hasSource ? isPlaying : false;

  return useMemo<UseAudioPlayerReturn>(
    () => ({
      get currentTime() {
        return hasSource ? timeStore.getTimeMs() : 0;
      },
      timeStore,
      getCurrentTimeMs,
      duration: effectiveDuration,
      isPlaying: effectiveIsPlaying,
      isSeeking,
      playbackRate,
      play,
      pause,
      togglePlay,
      seekTo,
      setSeeking,
      setPlaybackRate,
    }),
    [
      effectiveDuration,
      effectiveIsPlaying,
      getCurrentTimeMs,
      hasSource,
      isSeeking,
      pause,
      play,
      playbackRate,
      seekTo,
      setPlaybackRate,
      setSeeking,
      timeStore,
      togglePlay,
    ],
  );
}
