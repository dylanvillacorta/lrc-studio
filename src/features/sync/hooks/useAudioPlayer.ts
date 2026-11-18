/**
 * Hook de reproducción de audio a 60 FPS mediante `requestAnimationFrame`.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * bucle `requestAnimationFrame` (líneas 320-335), `seekTo` (línea 338),
 * `togglePlay` (línea 349) y `changeSpeed` (línea 361).
 *
 * `currentTime` y `duration` se expresan en milisegundos.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

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
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
  seekTo: (targetMs: number) => void;
  setPlaybackRate: (rate: number) => void;
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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDurationMs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(initialPlaybackRate);

  const getAudioElement = useCallback((): HTMLAudioElement | null => {
    if (externalRef) {
      return externalRef.current;
    }
    return internalAudioRef.current;
  }, [externalRef]);

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
      return;
    }

    const audio = new Audio(src);
    audio.playbackRate = playbackRate;
    internalAudioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
      if (internalAudioRef.current === audio) {
        internalAudioRef.current = null;
      }
    };
  }, [externalRef, src, playbackRate]);

  // Sincroniza eventos del elemento de audio.
  useEffect(() => {
    const audio = getAudioElement();
    if (!audio) {
      return;
    }

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(Math.round(audio.duration * 1000));
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(Math.round(audio.currentTime * 1000));
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [getAudioElement, src]);

  // Bucle 60 FPS con requestAnimationFrame mientras reproduce.
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
        setCurrentTime(Math.round(audio.currentTime * 1000));
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
  }, [isPlaying, getAudioElement]);

  const play = useCallback(async () => {
    const audio = getAudioElement();
    if (!audio) return;
    audio.playbackRate = playbackRate;
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [getAudioElement, playbackRate]);

  const pause = useCallback(() => {
    const audio = getAudioElement();
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
  }, [getAudioElement]);

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
      const maxMs = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
      const clampedMs = Math.max(0, Math.min(maxMs, Number(targetMs) || 0));
      const audio = getAudioElement();
      if (audio) {
        audio.currentTime = clampedMs / 1000;
      }
      setCurrentTime(Math.round(clampedMs));
    },
    [duration, getAudioElement],
  );

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const safeRate = Math.max(0.25, Math.min(2.0, rate));
      setPlaybackRateState(safeRate);
      const audio = getAudioElement();
      if (audio) {
        audio.playbackRate = safeRate;
        audio.preservesPitch = true;
      }
    },
    [getAudioElement],
  );

  return {
    currentTime,
    duration,
    isPlaying,
    playbackRate,
    play,
    pause,
    togglePlay,
    seekTo,
    setPlaybackRate,
  };
}
