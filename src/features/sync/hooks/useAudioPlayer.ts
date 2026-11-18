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
  assessAudioHealth,
  evaluatePlaybackProgress,
  flagForPageShow,
  flagForStalled,
  shouldRepairAudio,
  type AudioHealth,
  type AudioHealthFlag,
} from '@/features/sync/hooks/audioHealth';
import {
  clampTimeMs,
  needsCurrentTimeCorrection,
  nextPendingSeekMs,
  shouldApplySeek,
  type SeekOrigin,
  resolveDisplayedTimeMs,
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
  /** Id del proyecto al que pertenece el audio (para detectar elementos de otro proyecto). */
  projectId?: string | null;
  /**
   * Relee los bytes del audio desde el almacenamiento, recrea Blob/ObjectURL (revocando
   * la anterior) y devuelve la nueva URL vigente. `null` si no se pudo.
   */
  reloadAudioSource?: () => Promise<string | null>;
}

export type AudioRepairStatus = 'idle' | 'repairing' | 'failed';

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
  seekTo: (targetMs: number, origin?: SeekOrigin) => void;
  setSeeking: (seeking: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  /** Estado de la auto-reparación del audio. */
  repairStatus?: AudioRepairStatus;
  /** Reintenta la reparación (desde un gesto del usuario) y reproduce. */
  retryRepair?: () => void;
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
    projectId = null,
    reloadAudioSource,
  } = options;

  const internalAudioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const playbackRateRef = useRef(initialPlaybackRate);
  const pendingSeekMsRef = useRef<number | null>(null);
  const isSeekingRef = useRef(false);
  const userSeekedRef = useRef(false);
  const errorSeenRef = useRef(false);
  const currentSrcRef = useRef<string | null>(null);
  const flagRef = useRef<AudioHealthFlag | null>(null);
  const swappingRef = useRef(false);
  const projectIdRef = useRef<string | null>(projectId);
  const elementProjectIdRef = useRef<string | null>(null);
  const repairPromiseRef = useRef<Promise<boolean> | null>(null);
  const srcRef = useRef<string | null>(src);
  const reloadRef = useRef(reloadAudioSource);
  const probeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const handleFrozenRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    projectIdRef.current = projectId;
    if (elementProjectIdRef.current === null) {
      elementProjectIdRef.current = projectId;
    }
  }, [projectId]);
  useEffect(() => {
    srcRef.current = src;
    reloadRef.current = reloadAudioSource;
  }, [src, reloadAudioSource]);
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
  const [repairStatus, setRepairStatus] = useState<AudioRepairStatus>('idle');
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

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

  const assignSrc = useCallback((audio: HTMLAudioElement, nextSrc: string) => {
    swappingRef.current = true;
    errorSeenRef.current = false;
    currentSrcRef.current = nextSrc;
    audio.src = nextSrc;
    audio.load();
  }, []);

  const hasSrc = Boolean(src);

  // Ciclo de vida del elemento Audio interno: uno solo mientras haya audio. Se conserva
  // al reparar o cambiar de `src` (se reasigna el `src` en el mismo elemento) para que
  // el gesto del usuario que desbloqueó la reproducción siga valiendo en iOS.
  useEffect(() => {
    if (externalRef || typeof Audio === 'undefined' || !hasSrc) {
      return;
    }
    const audio = new Audio();
    audio.preload = 'auto';
    audio.playbackRate = playbackRateRef.current;
    audio.preservesPitch = true;
    internalAudioRef.current = audio;
    publishTestAudioRef(audio);

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (internalAudioRef.current === audio) {
        internalAudioRef.current = null;
        currentSrcRef.current = null;
        publishTestAudioRef(null);
      }
    };
  }, [externalRef, hasSrc]);

  // Asigna el `src` vigente al elemento (si no lo tiene ya por una reparación).
  useEffect(() => {
    if (externalRef || typeof Audio === 'undefined') {
      return;
    }
    if (!src) {
      durationRef.current = initialDurationRef.current;
      pendingSeekMsRef.current = null;
      flagRef.current = null;
      timeStore.setTimeMs(0);
      return;
    }
    const audio = internalAudioRef.current;
    if (!audio || currentSrcRef.current === src) {
      return;
    }
    // Al cambiar el audio se restaura la posición mostrada (causa T25:
    // antes el audio nuevo arrancaba en 0 mientras la interfaz seguía en otro tiempo).
    const restoreMs = resolveDisplayedTimeMs(
      pendingSeekMsRef.current,
      timeStore.getTimeMs(),
    );
    userSeekedRef.current = false;
    flagRef.current = null;
    elementProjectIdRef.current = projectIdRef.current;
    assignSrc(audio, src);
    if (restoreMs > 0) {
      pendingSeekMsRef.current = restoreMs;
    }
  }, [externalRef, src, timeStore, assignSrc]);

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

    const handleError = () => {
      errorSeenRef.current = true;
    };
    const handleEmptied = () => {
      if (swappingRef.current) return;
      flagRef.current = 'emptied';
    };
    const handleStalled = () => {
      const flag = flagForStalled(audio.readyState);
      if (flag && !flagRef.current) flagRef.current = flag;
      syncPlayingWithReality();
    };
    const handleLoadStart = () => {
      swappingRef.current = false;
    };
    const handleRecovered = () => {
      if (flagRef.current === 'stalled' || flagRef.current === 'emptied') {
        flagRef.current = null;
      }
      handleLoadedMetadata();
    };

    // El estado reportado no es fiable: se contrasta con la realidad del elemento.
    const syncPlayingWithReality = () => {
      if (audio.paused || audio.ended) {
        setIsPlaying(false);
      }
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
    audio.addEventListener('canplay', handleRecovered);
    audio.addEventListener('error', handleError);
    audio.addEventListener('emptied', handleEmptied);
    audio.addEventListener('stalled', handleStalled);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('waiting', syncPlayingWithReality);
    audio.addEventListener('suspend', syncPlayingWithReality);
    audio.addEventListener('seeked', handleSyncFromAudio);
    audio.addEventListener('timeupdate', handleSyncFromAudio);
    audio.addEventListener('playing', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleRecovered);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('emptied', handleEmptied);
      audio.removeEventListener('stalled', handleStalled);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('waiting', syncPlayingWithReality);
      audio.removeEventListener('suspend', syncPlayingWithReality);
      audio.removeEventListener('seeked', handleSyncFromAudio);
      audio.removeEventListener('timeupdate', handleSyncFromAudio);
      audio.removeEventListener('playing', handleLoadedMetadata);
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

  const canRepair = !externalRef && Boolean(reloadAudioSource);

  const evaluateHealth = useCallback(
    (audio: HTMLAudioElement): AudioHealth =>
      assessAudioHealth({
        expectedSrc: srcRef.current,
        currentSrc: currentSrcRef.current,
        expectedProjectId: projectIdRef.current,
        elementProjectId: elementProjectIdRef.current,
        readyState: audio.readyState,
        networkState: audio.networkState,
        hasError: Boolean(audio.error) || errorSeenRef.current,
        flag: flagRef.current,
      }),
    [],
  );

  // Relee los bytes, recrea Blob/ObjectURL y recarga el MISMO elemento Audio.
  const repairAudio = useCallback((): Promise<boolean> => {
    if (repairPromiseRef.current) {
      return repairPromiseRef.current;
    }
    const reload = reloadRef.current;
    if (externalRef || !reload || !getAudioElement()) {
      return Promise.resolve(false);
    }
    setRepairStatus('repairing');
    const run = async (): Promise<boolean> => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const url = await reload();
          const el = getAudioElement();
          if (!el) {
            setRepairStatus('idle');
            return false;
          }
          if (!url) {
            continue;
          }
          const shownMs = resolveDisplayedTimeMs(
            pendingSeekMsRef.current,
            timeStore.getTimeMs(),
          );
          flagRef.current = null;
          elementProjectIdRef.current = projectIdRef.current;
          srcRef.current = url;
          assignSrc(el, url);
          pendingSeekMsRef.current = shownMs > 0 ? shownMs : null;
          setRepairStatus('idle');
          return true;
        } catch {
          // se reintenta una vez
        }
      }
      setRepairStatus('failed');
      return false;
    };
    const promise = run().finally(() => {
      repairPromiseRef.current = null;
    });
    repairPromiseRef.current = promise;
    return promise;
  }, [assignSrc, externalRef, getAudioElement, timeStore]);

  // Audio congelado: dice reproducir pero `currentTime` no avanza. Sin gesto no se puede
  // reproducir: queda en pausa visible (botón Reproducir listo) y se repara en segundo plano.
  const handleFrozen = useCallback(() => {
    const audio = getAudioElement();
    if (!audio || externalRef) {
      return;
    }
    flagRef.current = 'frozen';
    audio.pause();
    setIsPlaying(false);
    if (canRepair) {
      void repairAudio();
    }
  }, [canRepair, externalRef, getAudioElement, repairAudio]);
  useEffect(() => {
    handleFrozenRef.current = handleFrozen;
  }, [handleFrozen]);

  // Vigilante de progreso con reloj real mientras se muestra «reproduciendo».
  useEffect(() => {
    if (!isPlaying || externalRef) {
      return;
    }
    let prev: { t: number; at: number } | null = null;
    const sample = () => {
      const audio = getAudioElement();
      if (!audio) return;
      if (
        audio.paused ||
        audio.ended ||
        audio.seeking ||
        isSeekingRef.current ||
        pendingSeekMsRef.current !== null ||
        repairPromiseRef.current !== null
      ) {
        prev = null;
        return;
      }
      const current = { t: audio.currentTime, at: performance.now() };
      if (prev) {
        const verdict = evaluatePlaybackProgress({
          prevTimeSec: prev.t,
          currTimeSec: current.t,
          elapsedMs: current.at - prev.at,
          playbackRate: audio.playbackRate,
        });
        if (verdict === 'frozen') {
          prev = null;
          handleFrozenRef.current();
          return;
        }
      }
      prev = current;
    };
    sample();
    const id = setInterval(sample, 1200);
    return () => clearInterval(id);
  }, [isPlaying, externalRef, getAudioElement]);

  // Marcas perezosas: nunca reproducen ni reparan solos.
  useEffect(() => {
    if (externalRef || typeof document === 'undefined') {
      return;
    }
    const probe = () => {
      const url = srcRef.current;
      if (!url || typeof fetch !== 'function') return;
      const id = ++probeRef.current;
      void (async () => {
        let ok = false;
        try {
          const response = await fetch(url);
          void response.body?.cancel?.();
          ok = response.ok;
        } catch {
          ok = false;
        }
        if (!ok && probeRef.current === id && srcRef.current === url) {
          flagRef.current = 'invalid-url';
        }
      })();
    };
    // Al volver a visible con «reproduciendo»: comprobar progreso real y, si no avanza,
    // pasar a pausa visible y marcar no sano.
    const checkResumedProgress = () => {
      if (!isPlayingRef.current) return;
      const audio = internalAudioRef.current;
      if (!audio) return;
      const start = { t: audio.currentTime, at: performance.now() };
      setTimeout(() => {
        const el = internalAudioRef.current;
        if (!el || el !== audio || !isPlayingRef.current) return;
        if (el.seeking || pendingSeekMsRef.current !== null) return;
        const verdict = evaluatePlaybackProgress({
          prevTimeSec: start.t,
          currTimeSec: el.currentTime,
          elapsedMs: performance.now() - start.at,
          playbackRate: el.playbackRate,
        });
        if (verdict === 'frozen' || el.paused) {
          handleFrozenRef.current();
        }
      }, 800);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        probe();
        checkResumedProgress();
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      const flag = flagForPageShow(event.persisted);
      if (flag) {
        flagRef.current = flag;
      } else {
        probe();
      }
      checkResumedProgress();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [externalRef]);

  const play = useCallback(async () => {
    const audio = getAudioElement();
    if (!audio) return;
    audio.playbackRate = playbackRateRef.current;
    if (
      repairPromiseRef.current !== null ||
      shouldRepairAudio(evaluateHealth(audio), {
        repairing: false,
        canRepair,
      })
    ) {
      // El primer toque sirve de gesto: se llama a `play()` sin esperar nada antes
      // (en silencio, para desbloquear el elemento) y luego se repara.
      audio.muted = true;
      audio.play().catch(() => undefined);
      const repaired = await repairAudio();
      audio.muted = false;
      if (!repaired) {
        audio.pause();
        setIsPlaying(false);
        return;
      }
    }
    // Salvaguarda: el audio debe sonar desde el tiempo mostrado.
    const displayedMs = resolveDisplayedTimeMs(
      pendingSeekMsRef.current,
      timeStore.getTimeMs(),
    );
    if (audio.readyState >= 1) {
      const target = clampTimeMs(
        displayedMs,
        Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0,
      );
      pendingSeekMsRef.current = null;
      if (needsCurrentTimeCorrection(target, audio.currentTime)) {
        audio.currentTime = target / 1000;
      }
      timeStore.setTimeMs(target);
    } else {
      // Sin metadatos (p. ej. Safari de iOS tras recargar): no se espera antes de
      // `play()` para no perder el gesto del usuario. Se fuerza la carga y el tiempo
      // mostrado se aplica con el primer evento disponible (`loadedmetadata`,
      // `canplay` o `playing`) antes de que suene.
      if (displayedMs > 0) {
        pendingSeekMsRef.current = displayedMs;
      }
      if (audio.networkState === 0 || audio.networkState === 3) {
        audio.load();
      }
    }    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [canRepair, evaluateHealth, getAudioElement, repairAudio, timeStore]);

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
    (targetMs: number, origin: SeekOrigin = 'user') => {
      if (!shouldApplySeek(origin, userSeekedRef.current)) {
        return;
      }
      if (origin === 'user') {
        userSeekedRef.current = true;
      }
      const effectiveDur =
        durationRef.current > 0 ? durationRef.current : Number.MAX_SAFE_INTEGER;
      const clampedMs = Math.max(0, Math.min(effectiveDur, Number(targetMs) || 0));
      const audio = getAudioElement();
      if (audio && audio.readyState >= 1) {
        pendingSeekMsRef.current = null;
        audio.currentTime = clampedMs / 1000;
      } else {
        pendingSeekMsRef.current = nextPendingSeekMs(
                    pendingSeekMsRef.current,
                    clampedMs,
                    origin,
                    userSeekedRef.current,
                  );
      }
      timeStore.setTimeMs(clampedMs);
      if (
        origin === 'user' &&
        audio &&
        shouldRepairAudio(evaluateHealth(audio), {
          repairing: repairPromiseRef.current !== null,
          canRepair,
        })
      ) {
        void repairAudio();
      }
    },
    [canRepair, evaluateHealth, getAudioElement, repairAudio, timeStore],
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

  const retryRepair = useCallback(() => {
    void (async () => {
      const ok = await repairAudio();
      if (ok) {
        await play();
      }
    })();
  }, [play, repairAudio]);

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
      repairStatus,
      retryRepair,
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
      repairStatus,
      retryRepair,
      seekTo,
      setPlaybackRate,
      setSeeking,
      timeStore,
      togglePlay,
    ],
  );
}
