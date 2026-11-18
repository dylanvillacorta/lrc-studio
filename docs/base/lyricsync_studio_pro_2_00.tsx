import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Upload,
  Download,
  Music,
  FileText,
  Sparkles,
  Sliders,
  CheckCircle2,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Crosshair,
  Repeat,
  Timer,
  ZoomIn,
  Gauge,
  Wand2,
  Copy,
  Check,
  Trash2,
  Volume2,
  VolumeX,
  FileJson,
  Eye,
  Keyboard,
  Plus,
  Minus,
  Radio,
  Disc
} from 'lucide-react';

// ============================================================================
// UTILIDADES DE FORMATO Y GENERACIÓN DE AUDIO DEMO (WAV SINTETIZADO EN MEMORIA)
// ============================================================================

const formatTime = (seconds, showMs = true) => {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '--:--.--';
  const safeSec = Math.max(0, Number(seconds));
  const mins = Math.floor(safeSec / 60);
  const secs = Math.floor(safeSec % 60);
  const ms = Math.floor((safeSec % 1) * 100);
  const minStr = String(mins).padStart(2, '0');
  const secStr = String(secs).padStart(2, '0');
  const msStr = String(ms).padStart(2, '0');
  return showMs ? `${minStr}:${secStr}.${msStr}` : `${minStr}:${secStr}`;
};

const formatLrcTimestamp = (seconds) => {
  const safeSec = Math.max(0, Number(seconds || 0));
  const mins = Math.floor(safeSec / 60);
  const secs = Math.floor(safeSec % 60);
  const cs = Math.floor((safeSec % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};

// Genera un archivo WAV real en memoria con progresión de acordes y pulso rítmico
const createSynthesizedDemoWav = (durationSeconds = 28) => {
  const sampleRate = 22050;
  const numSamples = durationSeconds * sampleRate;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const chords = [
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
    [130.81, 164.81, 196.0], // C
    [196.0, 246.94, 293.66], // G
  ];

  const melodyNotes = [329.63, 392.0, 440.0, 392.0, 349.23, 329.63, 293.66, 261.63];
  const peaks = [];
  const numPeakBins = 240;
  const samplesPerBin = Math.floor(numSamples / numPeakBins);
  let currentBinMax = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t * 2); // 120 BPM (2 pulsos por segundo)
    const beatPhase = (t * 2) % 1;
    const chord = chords[Math.floor(t / 4) % chords.length];

    // Pad armónico suave
    let pad =
      (Math.sin(2 * Math.PI * chord[0] * t) +
        Math.sin(2 * Math.PI * chord[1] * t) +
        Math.sin(2 * Math.PI * chord[2] * t)) /
      3;

    // Melodía guía que marca las sílabas
    const noteFreq = melodyNotes[beatIndex % melodyNotes.length];
    const noteEnv = Math.exp(-beatPhase * 4.5);
    const lead = Math.sin(2 * Math.PI * noteFreq * t) * noteEnv * 0.45;

    // Pulso de percusión suave cada medio segundo
    const kickEnv = Math.exp(-beatPhase * 18);
    const kick = Math.sin(2 * Math.PI * (90 - beatPhase * 45) * t) * kickEnv * 0.4;

    const sample = Math.max(-0.95, Math.min(0.95, pad * 0.3 + lead + kick));
    const absVal = Math.abs(sample);
    if (absVal > currentBinMax) currentBinMax = absVal;

    if (i > 0 && i % samplesPerBin === 0 && peaks.length < numPeakBins) {
      peaks.push(Math.min(1, currentBinMax * 1.15));
      currentBinMax = 0;
    }

    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return { url: URL.createObjectURL(blob), peaks, duration: durationSeconds };
};

// Letra de demostración inicial con las primeras 3 líneas pre-sincronizadas
const INITIAL_DEMO_LYRICS = `Luces de neón brillan en la ciudad
Caminamos juntos sin mirar atrás
Cada latido marca nuestra canción
El tiempo se detiene en tu voz
Subimos el volumen hasta el amanecer
Nada nos detiene hoy aquí`;

const buildStructuredLinesFromText = (rawText, preloadDemoTimings = false) => {
  const rawLines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const demoTimings = [
    { start: 1.5, end: 4.6 },
    { start: 5.2, end: 8.4 },
    { start: 9.0, end: 12.2 },
    { start: 13.0, end: null },
    { start: null, end: null },
    { start: null, end: null },
  ];

  return rawLines.map((lineText, lIdx) => {
    const tokens = lineText.split(/\s+/).filter(Boolean);
    const preset = preloadDemoTimings ? demoTimings[lIdx] : null;
    const hasFullLine = preset && preset.start !== null && preset.end !== null;
    const wordDur = hasFullLine ? (preset.end - preset.start) / tokens.length : 0;

    const words = tokens.map((wordText, wIdx) => {
      const cleanWord = String(wordText || '').trim() || `Palabra_${wIdx + 1}`;
      if (hasFullLine && lIdx < 2) {
        const wStart = Number((preset.start + wIdx * wordDur).toFixed(3));
        const wEnd = Number((wStart + wordDur - 0.04).toFixed(3));
        return {
          id: `w-${lIdx}-${wIdx}-${Math.random().toString(36).slice(2, 6)}`,
          text: cleanWord,
          startTime: wStart,
          endTime: wEnd,
        };
      }
      return {
        id: `w-${lIdx}-${wIdx}-${Math.random().toString(36).slice(2, 6)}`,
        text: cleanWord,
        startTime: null,
        endTime: null,
      };
    });

    return {
      id: `line-${lIdx}-${Math.random().toString(36).slice(2, 6)}`,
      text: lineText,
      startTime: preset ? preset.start : null,
      endTime: preset ? preset.end : null,
      words,
    };
  });
};

// Combina cambios del texto en bruto preservando marcas de tiempo existentes
const mergeRawTextWithExistingLines = (rawText, existingLines = []) => {
  const rawLines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return rawLines.map((lineText, lIdx) => {
    const prevLine = existingLines[lIdx];
    const tokens = lineText.split(/\s+/).filter(Boolean);

    const words = tokens.map((wordText, wIdx) => {
      const cleanWord = String(wordText || '').trim() || `Palabra_${wIdx + 1}`;
      const prevWord = prevLine?.words?.[wIdx];
      return {
        id: prevWord?.id || `w-${lIdx}-${wIdx}-${Math.random().toString(36).slice(2, 6)}`,
        text: cleanWord,
        startTime: prevWord?.startTime ?? null,
        endTime: prevWord?.endTime ?? null,
      };
    });

    return {
      id: prevLine?.id || `line-${lIdx}-${Math.random().toString(36).slice(2, 6)}`,
      text: lineText,
      startTime: prevLine?.startTime ?? null,
      endTime: prevLine?.endTime ?? null,
      words,
    };
  });
};

// ============================================================================
// COMPONENTE PRINCIPAL: LYRICSYNC STUDIO PRO
// ============================================================================

export default function App() {
  // --- Navegación de Estudio ---
  // 'setup' | 'lineSync' | 'wordSync' | 'preview'
  const [activeMode, setActiveMode] = useState('wordSync');

  // --- Metadatos de la Canción ---
  const [songMeta, setSongMeta] = useState({
    title: 'Luces de Neón (Demo Synth)',
    artist: 'LyricSync Studio Artist',
    album: 'Midnight Sessions',
    offsetMs: 0,
  });

  // --- Estado de Letra yEstructura de Sincronización ---
  const [rawLyricsText, setRawLyricsText] = useState(INITIAL_DEMO_LYRICS);
  const [lines, setLines] = useState(() =>
    buildStructuredLinesFromText(INITIAL_DEMO_LYRICS, true)
  );
  const [activeLineIndex, setActiveLineIndex] = useState(1);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [selectedInspectorWord, setSelectedInspectorWord] = useState({
    lineIdx: 1,
    wordIdx: 0,
  });

  // --- Sub-modos de Sincronización ---
  const [lineHoldMode, setLineHoldMode] = useState(false);
  const [wordSyncSubMode, setWordSyncSubMode] = useState('sniper'); // 'sniper' | 'isolatedLine' | 'tap' | 'hold'
  const [isHoldingSpace, setIsHoldingSpace] = useState(false);
  const [showShortcutsBar, setShowShortcutsBar] = useState(true);

  // --- Configuración del Motor de Pre-Roll y Línea Aislada ---
  const [preRollSeconds, setPreRollSeconds] = useState(2.5);
  const [postRollSeconds, setPostRollSeconds] = useState(0.8);
  const [autoLoopIsolatedLine, setAutoLoopIsolatedLine] = useState(true);
  const [sniperAutoAdvancePreRoll, setSniperAutoAdvancePreRoll] = useState(true);
  const [sniperHoldDuration, setSniperHoldDuration] = useState(false);
  const [draggingWordHandle, setDraggingWordHandle] = useState(null);

  // --- Estado del Motor de Audio ---
  const audioRef = useRef(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioFileName, setAudioFileName] = useState('Demo_Synth_120BPM.wav');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(28);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [waveformPeaks, setWaveformPeaks] = useState([]);

  // --- Opciones de Exportación JSON / LRC ---
  const [exportFormat, setExportFormat] = useState('json'); // 'json' | 'elrc' | 'lrc'
  const [jsonTimeUnit, setJsonTimeUnit] = useState('seconds'); // 'seconds' | 'ms'
  const [copiedFlag, setCopiedFlag] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Referencias para animaciones 60fps y scroll
  const rafRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const zoomWaveformCanvasRef = useRef(null);
  const lineRefs = useRef({});
  const previewRefs = useRef({});
  const fileInputRef = useRef(null);
  const jsonImportRef = useRef(null);

  // Mostrar notificación flotante breve
  const triggerToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  // --- Inicializar Audio Demo al montar ---
  useEffect(() => {
    const demo = createSynthesizedDemoWav(28);
    setAudioUrl(demo.url);
    setWaveformPeaks(demo.peaks);
    setDuration(demo.duration);
    return () => {
      if (demo.url) URL.revokeObjectURL(demo.url);
    };
  }, []);

  // --- Bucle requestAnimationFrame para precisión de 60 FPS ---
  useEffect(() => {
    const updateClock = () => {
      if (audioRef.current && !audioRef.current.paused) {
        setCurrentTime(audioRef.current.currentTime);
        rafRef.current = requestAnimationFrame(updateClock);
      }
    };
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(updateClock);
    } else if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  // --- Controles de Audio ---
  const seekTo = useCallback(
    (targetTime) => {
      const clamped = Math.max(0, Math.min(duration || 9999, Number(targetTime) || 0));
      if (audioRef.current) {
        audioRef.current.currentTime = clamped;
      }
      setCurrentTime(clamped);
    },
    [duration]
  );

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [playbackRate]);

  const changeSpeed = (rate) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      audioRef.current.preservesPitch = true;
    }
  };

  // --- Calcular Ventana de Tiempo de la Línea Activa + Pre-Roll y Post-Roll ---
  const getActiveLineWindow = useCallback(
    (lineIdx = activeLineIndex) => {
      const line = lines[lineIdx];
      if (!line) {
        return { lineStart: 0, lineEnd: 4, windowStart: 0, windowEnd: 5 };
      }
      const fallbackStart =
        lineIdx > 0 && lines[lineIdx - 1]?.endTime !== null
          ? lines[lineIdx - 1].endTime + 0.3
          : lineIdx * 3.5;
      const lineStart = line.startTime !== null ? line.startTime : fallbackStart;

      const syncedWordEnds = line.words.map((w) => w.endTime).filter((t) => t !== null);
      const nextLineStart = lines[lineIdx + 1]?.startTime;
      const fallbackEnd =
        syncedWordEnds.length > 0
          ? Math.max(...syncedWordEnds, lineStart + 1.8)
          : nextLineStart !== undefined && nextLineStart !== null && nextLineStart > lineStart
          ? nextLineStart - 0.1
          : lineStart + 3.6;

      const lineEnd = line.endTime !== null ? Math.max(lineStart + 0.5, line.endTime) : fallbackEnd;
      const windowStart = Math.max(0, Number((lineStart - preRollSeconds).toFixed(3)));
      const windowEnd = Math.min(
        duration || 9999,
        Number((lineEnd + postRollSeconds).toFixed(3))
      );

      return { lineStart, lineEnd, windowStart, windowEnd };
    },
    [activeLineIndex, lines, preRollSeconds, postRollSeconds, duration]
  );

  // --- Lanzar Reproducción con Pre-Roll (Para tener reflejos antes de la línea/palabra) ---
  const triggerPreRollPlay = useCallback(
    (customLineIdx = activeLineIndex, customWordIdx = activeWordIndex) => {
      const { windowStart } = getActiveLineWindow(customLineIdx);
      setActiveLineIndex(customLineIdx);
      setActiveWordIndex(customWordIdx);
      setSelectedInspectorWord({ lineIdx: customLineIdx, wordIdx: customWordIdx });
      seekTo(windowStart);
      if (audioRef.current) {
        audioRef.current.playbackRate = playbackRate;
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    },
    [activeLineIndex, activeWordIndex, getActiveLineWindow, playbackRate, seekTo]
  );

  // --- Vigilante de Bucle / Parada Automática al final de la línea en Modos Aislados ---
  useEffect(() => {
    if (
      !isPlaying ||
      activeMode !== 'wordSync' ||
      (wordSyncSubMode !== 'sniper' && wordSyncSubMode !== 'isolatedLine')
    ) {
      return;
    }

    const { windowStart, windowEnd } = getActiveLineWindow(activeLineIndex);
    if (currentTime >= windowEnd) {
      if (autoLoopIsolatedLine) {
        if (wordSyncSubMode === 'isolatedLine') {
          setActiveWordIndex(0);
        }
        seekTo(windowStart);
      } else {
        if (audioRef.current) audioRef.current.pause();
        setIsPlaying(false);
        seekTo(windowStart);
      }
    }
  }, [
    isPlaying,
    currentTime,
    activeMode,
    wordSyncSubMode,
    activeLineIndex,
    autoLoopIsolatedLine,
    getActiveLineWindow,
    seekTo,
  ]);

  // --- Carga de Archivo de Audio Local + Decodificación de Forma de Onda ---
  const handleAudioFileUpload = async (file) => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setAudioUrl(objectUrl);
    setAudioFileName(file.name);
    setIsPlaying(false);
    setCurrentTime(0);

    const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
    setSongMeta((prev) => ({ ...prev, title: cleanTitle }));

    try {
      const arrayBuf = await file.arrayBuffer();
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      const decoded = await audioCtx.decodeAudioData(arrayBuf);
      setDuration(decoded.duration);

      const channelData = decoded.getChannelData(0);
      const bins = 240;
      const blockSize = Math.floor(channelData.length / bins);
      const extractedPeaks = [];
      for (let i = 0; i < bins; i++) {
        let sum = 0;
        const start = i * blockSize;
        for (let j = 0; j < blockSize; j += 12) {
          const val = Math.abs(channelData[start + j] || 0);
          if (val > sum) sum = val;
        }
        extractedPeaks.push(Math.min(1, Math.max(0.06, sum)));
      }
      setWaveformPeaks(extractedPeaks);
      audioCtx.close();
      triggerToast(`Audio cargado: ${file.name}`);
    } catch {
      triggerToast('Audio cargado correctamente');
    }
  };

  // --- Dibujar Canvas de Onda Global Inferior ---
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    const safeDuration = duration > 0 ? duration : 1;
    const progressRatio = Math.min(1, Math.max(0, currentTime / safeDuration));

    // 1. Regiones de líneas sincronizadas
    lines.forEach((line, idx) => {
      if (line.startTime !== null) {
        const startX = (line.startTime / safeDuration) * width;
        const endT = line.endTime !== null ? line.endTime : line.startTime + 2.5;
        const endX = (endT / safeDuration) * width;
        const isCurrent = idx === activeLineIndex;

        ctx.fillStyle = isCurrent
          ? 'rgba(99, 102, 241, 0.25)'
          : 'rgba(16, 185, 129, 0.10)';
        ctx.fillRect(startX, 0, Math.max(3, endX - startX), height);

        ctx.strokeStyle = isCurrent
          ? 'rgba(129, 140, 248, 0.85)'
          : 'rgba(52, 211, 153, 0.45)';
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.stroke();
      }
    });

    // 2. Barras de forma de onda
    const peaks = waveformPeaks.length > 0 ? waveformPeaks : Array(180).fill(0.25);
    const barGap = 2;
    const barWidth = Math.max(1.5, (width - peaks.length * barGap) / peaks.length);

    peaks.forEach((peak, idx) => {
      const x = idx * (barWidth + barGap);
      const ratio = x / width;
      const barH = Math.max(4, peak * (height * 0.78));
      const y = (height - barH) / 2;

      ctx.fillStyle = ratio <= progressRatio ? '#818cf8' : '#3f3f46';
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 1.5);
      ctx.fill();
    });

    // 3. Cabezal de reproducción (Playhead)
    const playheadX = progressRatio * width;
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(playheadX - 1, 0, 2.5, height);
  }, [waveformPeaks, currentTime, duration, lines, activeLineIndex]);

  // --- Dibujar Canvas de Onda Ampliada (Zoom Exclusivo de la Línea Activa + Pre-Roll) ---
  useEffect(() => {
    if (activeMode !== 'wordSync') return;
    const canvas = zoomWaveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    const safeDuration = duration > 0 ? duration : 1;
    const { lineStart, lineEnd, windowStart, windowEnd } = getActiveLineWindow(activeLineIndex);
    const span = Math.max(0.5, windowEnd - windowStart);

    const timeToX = (t) => ((t - windowStart) / span) * width;

    // 1. Zona de Pre-Roll (Sombreado Ámbar de preparación de reflejos)
    const lineStartX = Math.max(0, timeToX(lineStart));
    if (lineStartX > 0) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.fillRect(0, 0, lineStartX, height);

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lineStartX, 0);
      ctx.lineTo(lineStartX, height);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('PRE-ROLL (IMPULSO)', 8, 14);
    }

    // 2. Zona de Post-Roll (Sombreado derecho después del fin de línea)
    const lineEndX = Math.min(width, timeToX(lineEnd));
    if (lineEndX < width) {
      ctx.fillStyle = 'rgba(113, 113, 122, 0.12)';
      ctx.fillRect(lineEndX, 0, width - lineEndX, height);
      ctx.strokeStyle = 'rgba(161, 161, 170, 0.4)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(lineEndX, 0);
      ctx.lineTo(lineEndX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Dibujar la porción de forma de onda correspondiente a [windowStart, windowEnd]
    const peaks = waveformPeaks.length > 0 ? waveformPeaks : Array(240).fill(0.25);
    const numSlices = 140;
    const barGap = 1.5;
    const barWidth = Math.max(1.5, (width - numSlices * barGap) / numSlices);

    for (let i = 0; i < numSlices; i++) {
      const sliceTime = windowStart + (i / numSlices) * span;
      const globalRatio = Math.max(0, Math.min(0.999, sliceTime / safeDuration));
      const peakIdx = Math.floor(globalRatio * peaks.length);
      const amp = Math.max(0.08, peaks[peakIdx] || 0.2);
      const barH = amp * (height * 0.68);
      const x = i * (barWidth + barGap);
      const y = (height - barH) / 2;

      const isPreRollSlice = sliceTime < lineStart;
      if (sliceTime <= currentTime) {
        ctx.fillStyle = isPreRollSlice ? '#f59e0b' : '#818cf8';
      } else {
        ctx.fillStyle = isPreRollSlice ? 'rgba(245, 158, 11, 0.28)' : '#27272a';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 1.5);
      ctx.fill();
    }

    // 4. Bloques de Palabras de la Línea Activa (con bordes arrastrables)
    const activeLine = lines[activeLineIndex];
    if (activeLine && activeLine.words) {
      activeLine.words.forEach((w, wIdx) => {
        if (w.startTime === null) return;
        const wStart = w.startTime;
        const wEnd = w.endTime !== null ? w.endTime : wStart + 0.35;
        const x1 = timeToX(wStart);
        const x2 = timeToX(wEnd);
        const blockW = Math.max(6, x2 - x1);
        const isTargetWord = wIdx === activeWordIndex;

        ctx.fillStyle = isTargetWord
          ? 'rgba(99, 102, 241, 0.38)'
          : 'rgba(16, 185, 129, 0.22)';
        ctx.fillRect(x1, 18, blockW, height - 24);

        ctx.strokeStyle = isTargetWord ? '#818cf8' : '#34d399';
        ctx.lineWidth = isTargetWord ? 2 : 1;
        ctx.strokeRect(x1, 18, blockW, height - 24);

        ctx.fillStyle = '#ffffff';
        ctx.font = isTargetWord ? 'bold 11px sans-serif' : '10px sans-serif';
        ctx.fillText(w.text.slice(0, 12), x1 + 4, height - 12);
      });
    }

    // 5. Playhead en la vista con zoom
    if (currentTime >= windowStart && currentTime <= windowEnd) {
      const playX = timeToX(currentTime);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(playX - 1, 0, 2.5, height);
    }
  }, [
    activeMode,
    waveformPeaks,
    currentTime,
    duration,
    lines,
    activeLineIndex,
    activeWordIndex,
    getActiveLineWindow,
  ]);

  // --- Interacción de Arrastre de Bordes de Palabra en el Zoom de Onda ---
  useEffect(() => {
    if (!draggingWordHandle) return;

    const handleMouseMove = (e) => {
      const canvas = zoomWaveformCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const { windowStart, windowEnd } = getActiveLineWindow(draggingWordHandle.lineIdx);
      const newTime = Number((windowStart + ratio * (windowEnd - windowStart)).toFixed(3));

      setLines((prevLines) => {
        const line = prevLines[draggingWordHandle.lineIdx];
        if (!line) return prevLines;
        const words = [...line.words];
        const word = words[draggingWordHandle.wordIdx];
        if (!word) return prevLines;

        if (draggingWordHandle.edge === 'start') {
          const maxStart = word.endTime !== null ? word.endTime - 0.04 : newTime;
          words[draggingWordHandle.wordIdx] = {
            ...word,
            startTime: Number(Math.max(0, Math.min(newTime, maxStart)).toFixed(3)),
          };
        } else {
          const minEnd = (word.startTime ?? 0) + 0.04;
          words[draggingWordHandle.wordIdx] = {
            ...word,
            endTime: Number(Math.max(minEnd, newTime).toFixed(3)),
          };
        }

        const validStarts = words.map((w) => w.startTime).filter((t) => t !== null);
        const validEnds = words.map((w) => w.endTime).filter((t) => t !== null);
        const copy = [...prevLines];
        copy[draggingWordHandle.lineIdx] = {
          ...line,
          startTime: validStarts.length > 0 ? Math.min(...validStarts) : line.startTime,
          endTime: validEnds.length > 0 ? Math.max(...validEnds) : line.endTime,
          words,
        };
        return copy;
      });
    };

    const handleMouseUp = () => {
      setDraggingWordHandle(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingWordHandle, getActiveLineWindow]);

  // ============================================================================
  // LÓGICA DE SINCRONIZACIÓN DE LÍNEAS Y PALABRAS
  // ============================================================================

  const stampCurrentLineStart = useCallback(() => {
    const now = Number((audioRef.current ? audioRef.current.currentTime : currentTime).toFixed(3));

    setLines((prevLines) => {
      const updated = [...prevLines];
      if (activeLineIndex < 0 || activeLineIndex >= updated.length) return prevLines;

      // Si la línea anterior no tenía endTime o su endTime se solapa, la cerramos limpiamente
      if (activeLineIndex > 0) {
        const prev = updated[activeLineIndex - 1];
        if (prev.startTime !== null && (prev.endTime === null || prev.endTime > now)) {
          updated[activeLineIndex - 1] = {
            ...prev,
            endTime: Number(Math.max(prev.startTime + 0.1, now - 0.04).toFixed(3)),
          };
        }
      }

      const curr = updated[activeLineIndex];
      updated[activeLineIndex] = {
        ...curr,
        startTime: now,
        endTime: curr.endTime && curr.endTime > now ? curr.endTime : null,
      };
      return updated;
    });

    if (!lineHoldMode && activeLineIndex < lines.length - 1) {
      setActiveLineIndex((prev) => prev + 1);
    }
  }, [activeLineIndex, currentTime, lineHoldMode, lines.length]);

  const stampCurrentLineEnd = useCallback(
    (advanceAfter = false) => {
      const now = Number((audioRef.current ? audioRef.current.currentTime : currentTime).toFixed(3));
      const targetIdx = advanceAfter ? activeLineIndex : Math.max(0, activeLineIndex - 1);

      setLines((prevLines) => {
        const updated = [...prevLines];
        const target = updated[targetIdx];
        if (!target || target.startTime === null) return prevLines;
        updated[targetIdx] = {
          ...target,
          endTime: Number(Math.max(target.startTime + 0.15, now).toFixed(3)),
        };
        return updated;
      });

      if (advanceAfter && activeLineIndex < lines.length - 1) {
        setActiveLineIndex((prev) => prev + 1);
      }
      triggerToast(`Corte instrumental marcado en ${formatTime(now)}`);
    },
    [activeLineIndex, currentTime, lines.length, triggerToast]
  );

  const undoLineSync = useCallback(() => {
    const targetIdx = Math.max(0, activeLineIndex - 1);
    const targetLine = lines[targetIdx];
    const rewindTarget =
      targetLine && targetLine.startTime !== null
        ? Math.max(0, targetLine.startTime - 2.0)
        : Math.max(0, currentTime - 2.5);

    setLines((prev) => {
      const copy = [...prev];
      if (copy[targetIdx]) {
        copy[targetIdx] = { ...copy[targetIdx], startTime: null, endTime: null };
      }
      return copy;
    });

    setActiveLineIndex(targetIdx);
    seekTo(rewindTarget);
    triggerToast(`Deshecha línea #${targetIdx + 1} (Rebobinado -2s)`);
  }, [activeLineIndex, currentTime, lines, seekTo, triggerToast]);

  // --- Marcar Inicio de Palabra (Soporta Sniper 1 palabra, Línea Aislada, Tap y Hold) ---
  const stampWordStart = useCallback(() => {
    const now = Number((audioRef.current ? audioRef.current.currentTime : currentTime).toFixed(3));

    setLines((prevLines) => {
      const updatedLines = [...prevLines];
      const line = updatedLines[activeLineIndex];
      if (!line) return prevLines;

      const updatedWords = [...line.words];
      const currentWord = updatedWords[activeWordIndex];
      if (!currentWord) return prevLines;

      // Cerrar palabra anterior si seguía abierta o se solapa
      if (activeWordIndex > 0) {
        const prevW = updatedWords[activeWordIndex - 1];
        if (prevW.startTime !== null && (prevW.endTime === null || prevW.endTime > now)) {
          updatedWords[activeWordIndex - 1] = {
            ...prevW,
            endTime: Number(Math.max(prevW.startTime + 0.05, now - 0.02).toFixed(3)),
          };
        }
      }

      const needsDefaultEnd =
        wordSyncSubMode === 'tap' ||
        wordSyncSubMode === 'isolatedLine' ||
        (wordSyncSubMode === 'sniper' && !sniperHoldDuration);

      const defaultEnd = needsDefaultEnd ? Number((now + 0.38).toFixed(3)) : null;

      updatedWords[activeWordIndex] = {
        ...currentWord,
        startTime: now,
        endTime: defaultEnd,
      };

      const newLineStart =
        activeWordIndex === 0 || line.startTime === null
          ? now
          : Math.min(line.startTime, now);

      const isLastWordInLine = activeWordIndex === updatedWords.length - 1;
      const newLineEnd =
        isLastWordInLine && defaultEnd !== null
          ? Math.max(line.endTime || 0, defaultEnd)
          : line.endTime;

      updatedLines[activeLineIndex] = {
        ...line,
        startTime: newLineStart,
        endTime: newLineEnd,
        words: updatedWords,
      };

      return updatedLines;
    });

    setSelectedInspectorWord({ lineIdx: activeLineIndex, wordIdx: activeWordIndex });

    const currentLineObj = lines[activeLineIndex];
    if (!currentLineObj) return;

    if (wordSyncSubMode === 'sniper') {
      if (!sniperHoldDuration) {
        const nextWordIdx = activeWordIndex + 1;
        if (nextWordIdx < currentLineObj.words.length) {
          setActiveWordIndex(nextWordIdx);
          setSelectedInspectorWord({ lineIdx: activeLineIndex, wordIdx: nextWordIdx });
          if (sniperAutoAdvancePreRoll) {
            const { windowStart } = getActiveLineWindow(activeLineIndex);
            setTimeout(() => {
              seekTo(windowStart);
            }, 140);
            triggerToast(
              `¡"${currentLineObj.words[activeWordIndex].text}" capturada! Pre-Roll listo para "${currentLineObj.words[nextWordIdx].text}"`
            );
          } else {
            if (audioRef.current) audioRef.current.pause();
            setIsPlaying(false);
            triggerToast(
              `Palabra "${currentLineObj.words[activeWordIndex].text}" marcada. Pulsa [R] para la siguiente.`
            );
          }
        } else {
          if (audioRef.current) audioRef.current.pause();
          setIsPlaying(false);
          triggerToast(`¡Línea #${activeLineIndex + 1} completada al 100%!`);
        }
      }
      return;
    }

    if (wordSyncSubMode === 'isolatedLine') {
      if (activeWordIndex < currentLineObj.words.length - 1) {
        setActiveWordIndex((prev) => prev + 1);
      } else {
        triggerToast(`Fin de palabras de la Línea #${activeLineIndex + 1}`);
      }
      return;
    }

    if (wordSyncSubMode === 'tap') {
      if (activeWordIndex < currentLineObj.words.length - 1) {
        setActiveWordIndex((prev) => prev + 1);
      } else if (activeLineIndex < lines.length - 1) {
        setActiveLineIndex((prev) => prev + 1);
        setActiveWordIndex(0);
      }
    }
  }, [
    activeLineIndex,
    activeWordIndex,
    currentTime,
    lines,
    wordSyncSubMode,
    sniperHoldDuration,
    sniperAutoAdvancePreRoll,
    getActiveLineWindow,
    seekTo,
    triggerToast,
  ]);

  const stampWordEndOnRelease = useCallback(() => {
    const now = Number((audioRef.current ? audioRef.current.currentTime : currentTime).toFixed(3));

    setLines((prevLines) => {
      const line = prevLines[activeLineIndex];
      if (!line) return prevLines;
      const updatedWords = [...line.words];
      const w = updatedWords[activeWordIndex];
      if (!w || w.startTime === null) return prevLines;

      const finalEnd = Number(Math.max(w.startTime + 0.06, now).toFixed(3));
      updatedWords[activeWordIndex] = {
        ...w,
        endTime: finalEnd,
      };

      const isLastWord = activeWordIndex === updatedWords.length - 1;
      const updatedLines = [...prevLines];
      updatedLines[activeLineIndex] = {
        ...line,
        endTime: isLastWord ? Math.max(line.endTime || 0, finalEnd) : line.endTime,
        words: updatedWords,
      };
      return updatedLines;
    });

    const currentLineObj = lines[activeLineIndex];
    if (!currentLineObj) return;

    if (wordSyncSubMode === 'sniper' && sniperHoldDuration) {
      const nextWordIdx = activeWordIndex + 1;
      if (nextWordIdx < currentLineObj.words.length) {
        setActiveWordIndex(nextWordIdx);
        setSelectedInspectorWord({ lineIdx: activeLineIndex, wordIdx: nextWordIdx });
        if (sniperAutoAdvancePreRoll) {
          const { windowStart } = getActiveLineWindow(activeLineIndex);
          seekTo(windowStart);
        } else {
          if (audioRef.current) audioRef.current.pause();
          setIsPlaying(false);
        }
      } else {
        if (audioRef.current) audioRef.current.pause();
        setIsPlaying(false);
        triggerToast(`¡Línea #${activeLineIndex + 1} completada con duración exacta!`);
      }
      return;
    }

    if (activeWordIndex < currentLineObj.words.length - 1) {
      setActiveWordIndex((prev) => prev + 1);
    } else if (wordSyncSubMode === 'hold' && activeLineIndex < lines.length - 1) {
      setActiveLineIndex((prev) => prev + 1);
      setActiveWordIndex(0);
    }
  }, [
    activeLineIndex,
    activeWordIndex,
    currentTime,
    lines,
    wordSyncSubMode,
    sniperHoldDuration,
    sniperAutoAdvancePreRoll,
    getActiveLineWindow,
    seekTo,
    triggerToast,
  ]);

  // Auto-distribuir uniformemente las palabras de una línea
  const distributeWordsEvenlyInLine = (lineIdx) => {
    setLines((prevLines) => {
      const line = prevLines[lineIdx];
      if (!line || line.words.length === 0) return prevLines;

      const startT = line.startTime !== null ? line.startTime : currentTime;
      const nextLineStart = prevLines[lineIdx + 1]?.startTime;
      const endT =
        line.endTime !== null
          ? line.endTime
          : nextLineStart && nextLineStart > startT
          ? nextLineStart - 0.1
          : startT + Math.max(2.0, line.words.length * 0.45);

      const totalSpan = Math.max(0.5, endT - startT);
      const totalChars = line.words.reduce((acc, w) => acc + Math.max(2, w.text.length), 0);

      let cursor = startT;
      const distributedWords = line.words.map((w) => {
        const weight = Math.max(2, w.text.length) / totalChars;
        const wSpan = totalSpan * weight;
        const wStart = Number(cursor.toFixed(3));
        const wEnd = Number((cursor + Math.max(0.08, wSpan - 0.03)).toFixed(3));
        cursor += wSpan;
        return { ...w, startTime: wStart, endTime: wEnd };
      });

      const updated = [...prevLines];
      updated[lineIdx] = {
        ...line,
        startTime: Number(startT.toFixed(3)),
        endTime: Number(endT.toFixed(3)),
        words: distributedWords,
      };
      return updated;
    });
    triggerToast(`Palabras de la Línea #${lineIdx + 1} auto-distribuidas proporcionalmente`);
  };

  // Micro-ajuste de precisión (+10ms / -10ms / +50ms / -50ms)
  const nudgeWordTime = useCallback((lineIdx, wordIdx, field, deltaSeconds) => {
    setLines((prev) => {
      const copy = [...prev];
      const line = copy[lineIdx];
      if (!line) return prev;
      const words = [...line.words];
      const w = words[wordIdx];
      if (!w) return prev;

      const baseVal = w[field] !== null ? w[field] : 0;
      const nextVal = Number(Math.max(0, baseVal + deltaSeconds).toFixed(3));
      words[wordIdx] = { ...w, [field]: nextVal };

      const validStarts = words.map((item) => item.startTime).filter((t) => t !== null);
      const validEnds = words.map((item) => item.endTime).filter((t) => t !== null);

      copy[lineIdx] = {
        ...line,
        startTime: validStarts.length > 0 ? Math.min(...validStarts) : line.startTime,
        endTime: validEnds.length > 0 ? Math.max(...validEnds) : line.endTime,
        words,
      };
      return copy;
    });
  }, []);

  // ============================================================================
  // ATAJOS DE TECLADO GLOBALES DE ESTUDIO
  // ============================================================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;

      if (e.code === 'KeyP') {
        e.preventDefault();
        togglePlay();
        return;
      }

      if (e.code === 'KeyR' && activeMode === 'wordSync') {
        e.preventDefault();
        const resetIdx = wordSyncSubMode === 'isolatedLine' ? 0 : activeWordIndex;
        triggerPreRollPlay(activeLineIndex, resetIdx);
        return;
      }

      if (activeMode === 'wordSync' && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        e.preventDefault();
        const delta = e.code === 'BracketLeft' ? -0.02 : 0.02;
        nudgeWordTime(activeLineIndex, activeWordIndex, 'startTime', delta);
        return;
      }

      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (activeMode === 'wordSync' && !e.shiftKey) {
          const prevW = Math.max(0, activeWordIndex - 1);
          setActiveWordIndex(prevW);
          setSelectedInspectorWord({ lineIdx: activeLineIndex, wordIdx: prevW });
        } else {
          const step = e.shiftKey ? 0.5 : 2.0;
          seekTo(currentTime - step);
        }
        return;
      }

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (activeMode === 'wordSync' && !e.shiftKey) {
          const maxW = Math.max(0, (lines[activeLineIndex]?.words?.length || 1) - 1);
          const nextW = Math.min(maxW, activeWordIndex + 1);
          setActiveWordIndex(nextW);
          setSelectedInspectorWord({ lineIdx: activeLineIndex, wordIdx: nextW });
        } else {
          const step = e.shiftKey ? 0.5 : 2.0;
          seekTo(currentTime + step);
        }
        return;
      }

      if (activeMode === 'lineSync') {
        if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
          e.preventDefault();
          if (audioRef.current && audioRef.current.paused) {
            audioRef.current.play().catch(() => {});
            setIsPlaying(true);
          }
          setIsHoldingSpace(true);
          stampCurrentLineStart();
        } else if (e.code === 'KeyX') {
          e.preventDefault();
          stampCurrentLineEnd(false);
        } else if (e.code === 'Backspace' || e.code === 'ArrowUp') {
          e.preventDefault();
          undoLineSync();
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          setActiveLineIndex((prev) => Math.min(lines.length - 1, prev + 1));
        }
      } else if (activeMode === 'wordSync') {
        if (e.code === 'Space' && !e.repeat) {
          e.preventDefault();
          if (audioRef.current && audioRef.current.paused) {
            audioRef.current.play().catch(() => {});
            setIsPlaying(true);
          }
          setIsHoldingSpace(true);
          stampWordStart();
        } else if (e.code === 'ArrowUp') {
          e.preventDefault();
          const prevL = Math.max(0, activeLineIndex - 1);
          setActiveLineIndex(prevL);
          setActiveWordIndex(0);
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          const nextL = Math.min(lines.length - 1, activeLineIndex + 1);
          setActiveLineIndex(nextL);
          setActiveWordIndex(0);
        }
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        togglePlay();
      }
    };

    const handleKeyUp = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsHoldingSpace(false);
        if (activeMode === 'lineSync' && lineHoldMode) {
          stampCurrentLineEnd(true);
        } else if (
          activeMode === 'wordSync' &&
          (wordSyncSubMode === 'hold' || (wordSyncSubMode === 'sniper' && sniperHoldDuration))
        ) {
          stampWordEndOnRelease();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    activeMode,
    currentTime,
    lineHoldMode,
    wordSyncSubMode,
    sniperHoldDuration,
    activeLineIndex,
    activeWordIndex,
    lines,
    seekTo,
    stampCurrentLineStart,
    stampCurrentLineEnd,
    undoLineSync,
    stampWordStart,
    stampWordEndOnRelease,
    togglePlay,
    triggerPreRollPlay,
    nudgeWordTime,
  ]);

  // --- Auto-scroll del Teleprompter en Modo Línea y Vista Previa ---
  useEffect(() => {
    if (activeMode === 'lineSync' && lineRefs.current[activeLineIndex]) {
      lineRefs.current[activeLineIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLineIndex, activeMode]);

  const currentPlayingLineIndex = useMemo(() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (l.startTime !== null && currentTime >= l.startTime) {
        if (l.endTime === null || currentTime <= l.endTime + 0.6) {
          return i;
        }
      }
    }
    return -1;
  }, [lines, currentTime]);

  useEffect(() => {
    if (
      activeMode === 'preview' &&
      currentPlayingLineIndex >= 0 &&
      previewRefs.current[currentPlayingLineIndex]
    ) {
      previewRefs.current[currentPlayingLineIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentPlayingLineIndex, activeMode]);

  // ============================================================================
  // GENERADOR DE EXPORTACIÓN (JSON ESTRUCTURADO, ELRC Y LRC)
  // ============================================================================
  const exportedOutput = useMemo(() => {
    const offsetSec = (Number(songMeta.offsetMs) || 0) / 1000;
    const convertUnit = (val) => {
      if (val === null || val === undefined) return null;
      const adjusted = Math.max(0, val + offsetSec);
      return jsonTimeUnit === 'ms' ? Math.round(adjusted * 1000) : Number(adjusted.toFixed(3));
    };

    if (exportFormat === 'json') {
      const payload = {
        schemaVersion: '2.0-musixmatch-richsync',
        metadata: {
          title: songMeta.title,
          artist: songMeta.artist,
          album: songMeta.album,
          audioFileName,
          durationSeconds: Number(duration.toFixed(3)),
          timeUnit: jsonTimeUnit,
          offsetMs: Number(songMeta.offsetMs) || 0,
          exportedAt: new Date().toISOString(),
        },
        lines: lines.map((line, idx) => {
          const sTime = convertUnit(line.startTime);
          const eTime = convertUnit(line.endTime);
          return {
            index: idx,
            id: line.id,
            text: line.text,
            startTime: sTime,
            endTime: eTime,
            duration:
              sTime !== null && eTime !== null
                ? Number((eTime - sTime).toFixed(jsonTimeUnit === 'ms' ? 0 : 3))
                : null,
            words: line.words.map((w, wIdx) => ({
              index: wIdx,
              text: w.text,
              startTime: convertUnit(w.startTime),
              endTime: convertUnit(w.endTime),
            })),
          };
        }),
      };
      return JSON.stringify(payload, null, 2);
    }

    if (exportFormat === 'elrc') {
      const header = [
        `[ti:${songMeta.title}]`,
        `[ar:${songMeta.artist}]`,
        `[al:${songMeta.album}]`,
        `[by:LyricSync Studio Pro]`,
        '',
      ];
      const body = lines.map((l) => {
        const lineStamp = `[${formatLrcTimestamp((l.startTime || 0) + offsetSec)}]`;
        const wordsStr = l.words
          .map((w) => {
            if (w.startTime === null) return w.text;
            return `<${formatLrcTimestamp(w.startTime + offsetSec)}>${w.text}`;
          })
          .join(' ');
        return `${lineStamp} ${wordsStr}`;
      });
      return [...header, ...body].join('\n');
    }

    const header = [
      `[ti:${songMeta.title}]`,
      `[ar:${songMeta.artist}]`,
      `[al:${songMeta.album}]`,
      '',
    ];
    const body = lines.map(
      (l) => `[${formatLrcTimestamp((l.startTime || 0) + offsetSec)}] ${l.text}`
    );
    return [...header, ...body].join('\n');
  }, [exportFormat, jsonTimeUnit, lines, songMeta, audioFileName, duration]);

  const handleDownloadOutput = () => {
    const ext = exportFormat === 'json' ? 'json' : exportFormat === 'elrc' ? 'elrc' : 'lrc';
    const mime = exportFormat === 'json' ? 'application/json' : 'text/plain;charset=utf-8';
    const blob = new Blob([exportedOutput], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (songMeta.title || 'cancion_sincronizada')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '_');
    a.href = url;
    a.download = `${safeName}_lyrics.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast(`Archivo .${ext.toUpperCase()} descargado`);
  };

  const handleImportJsonProject = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        if (Array.isArray(parsed.lines)) {
          const isMs = parsed.metadata?.timeUnit === 'ms';
          const factor = isMs ? 0.001 : 1;
          const restoredLines = parsed.lines.map((l, idx) => ({
            id: l.id || `line-${idx}`,
            text: l.text || '',
            startTime: l.startTime !== null && l.startTime !== undefined ? Number((l.startTime * factor).toFixed(3)) : null,
            endTime: l.endTime !== null && l.endTime !== undefined ? Number((l.endTime * factor).toFixed(3)) : null,
            words: Array.isArray(l.words)
              ? l.words.map((w, wIdx) => ({
                  id: `w-${idx}-${wIdx}`,
                  text: w.text || '',
                  startTime:
                    w.startTime !== null && w.startTime !== undefined
                      ? Number((w.startTime * factor).toFixed(3))
                      : null,
                  endTime:
                    w.endTime !== null && w.endTime !== undefined
                      ? Number((w.endTime * factor).toFixed(3))
                      : null,
                }))
              : [],
          }));
          setLines(restoredLines);
          setRawLyricsText(restoredLines.map((l) => l.text).join('\n'));
          if (parsed.metadata) {
            setSongMeta((prev) => ({
              ...prev,
              title: parsed.metadata.title || prev.title,
              artist: parsed.metadata.artist || prev.artist,
              album: parsed.metadata.album || prev.album,
            }));
          }
          triggerToast('Proyecto JSON importado con éxito');
        }
      } catch {
        triggerToast('Error al leer el archivo JSON');
      }
    };
    reader.readAsText(file);
  };

  const inspectedWord =
    lines[selectedInspectorWord.lineIdx]?.words?.[selectedInspectorWord.wordIdx] ||
    lines[activeLineIndex]?.words?.[activeWordIndex] ||
    null;

  const syncedLinesCount = lines.filter((l) => l.startTime !== null).length;
  const totalWordsCount = lines.reduce((acc, l) => acc + l.words.length, 0);
  const syncedWordsCount = lines.reduce(
    (acc, l) => acc + l.words.filter((w) => w.startTime !== null).length,
    0
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Elemento de Audio Oculto */}
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        muted={isMuted}
        onLoadedMetadata={(e) => {
          if (e.currentTarget.duration && isFinite(e.currentTarget.duration)) {
            setDuration(e.currentTarget.duration);
          }
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Inputs ocultos para carga de archivos */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => handleAudioFileUpload(e.target.files?.[0])}
      />
      <input
        ref={jsonImportRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportJsonProject}
      />

      {/* Notificación Toast */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 bg-indigo-600/95 text-white px-4 py-2.5 rounded-xl shadow-2xl border border-indigo-400/40 flex items-center gap-2 text-xs font-semibold backdrop-blur-md">
          <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ====================================================================
          BARRA SUPERIOR DE ESTUDIO
      ==================================================================== */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/80 backdrop-blur-md sticky top-0 z-30 px-4 lg:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Marca y estado del proyecto */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Disc className={`w-5 h-5 text-white ${isPlaying ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base sm:text-lg tracking-tight text-white">
                  LyricSync Studio Pro
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                  Musixmatch + Pre-Roll Sniper
                </span>
              </div>
              <p className="text-xs text-zinc-400 truncate max-w-[260px] sm:max-w-md">
                {songMeta.title} • {syncedLinesCount}/{lines.length} líneas • {syncedWordsCount}/
                {totalWordsCount} palabras
              </p>
            </div>
          </div>

          {/* Selector de los 4 Modos de Trabajo */}
          <nav className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 overflow-x-auto">
            {[
              { id: 'setup', label: '1. Letra & Audio', icon: FileText },
              { id: 'lineSync', label: '2. Sincronizar Líneas', icon: Radio },
              { id: 'wordSync', label: '3. Palabra a Palabra (Pre-Roll)', icon: Crosshair },
              { id: 'preview', label: '4. Karaoke & JSON', icon: FileJson },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeMode === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveMode(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                    active
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Botones Rápidos de Carga de Audio y Descarga JSON */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Cargar Audio</span>
            </button>
            <button
              onClick={() => {
                setActiveMode('preview');
                handleDownloadOutput();
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar JSON</span>
            </button>
          </div>
        </div>
      </header>

      {/* ====================================================================
          ÁREA CENTRAL DE TRABAJO (SEGÚN EL MODO SELECCIONADO)
      ==================================================================== */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-6 py-4 flex flex-col gap-4 overflow-hidden">
        {/* ------------------------------------------------------------------
            MODO 1: CONFIGURACIÓN DE AUDIO Y EDITOR DE LETRA
        ------------------------------------------------------------------ */}
        {activeMode === 'setup' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
            {/* Columna Izquierda: Archivo de Audio y Metadatos */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                    <Music className="w-4 h-4 text-indigo-400" />
                    <span>Fuente de Audio</span>
                  </h2>
                  <button
                    onClick={() => jsonImportRef.current?.click()}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                  >
                    Importar JSON previo
                  </button>
                </div>

                {/* Zona Drag & Drop de Audio */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleAudioFileUpload(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-700 hover:border-indigo-500 bg-zinc-950/60 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center gap-2"
                >
                  <div className="w-11 h-11 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-zinc-200">
                    Arrastra tu canción aquí o haz clic para elegir
                  </p>
                  <p className="text-xs text-zinc-400">
                    Soporta MP3, WAV, FLAC, M4A, OGG • Actualmente:{' '}
                    <span className="text-emerald-400 font-mono">{audioFileName}</span>
                  </p>
                </div>

                {/* Metadatos del JSON */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400">
                      Título de la canción
                    </label>
                    <input
                      type="text"
                      value={songMeta.title}
                      onChange={(e) => setSongMeta({ ...songMeta, title: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400">Artista</label>
                    <input
                      type="text"
                      value={songMeta.artist}
                      onChange={(e) => setSongMeta({ ...songMeta, artist: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400">Álbum</label>
                    <input
                      type="text"
                      value={songMeta.album}
                      onChange={(e) => setSongMeta({ ...songMeta, album: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400">
                      Offset Global (ms)
                    </label>
                    <input
                      type="number"
                      value={songMeta.offsetMs}
                      onChange={(e) =>
                        setSongMeta({ ...songMeta, offsetMs: Number(e.target.value) })
                      }
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Columna Derecha: Editor de Letra en Bruto */}
            <div className="lg:col-span-7 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">
                    Letra de la Canción (Una frase por línea)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Pega o edita aquí la letra. Las líneas y palabras se actualizan automáticamente conservando tus tiempos.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const rebuilt = buildStructuredLinesFromText(rawLyricsText, false);
                      setLines(rebuilt);
                      setActiveLineIndex(0);
                      setActiveWordIndex(0);
                      triggerToast(`Letra reiniciada (${rebuilt.length} líneas listas)`);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Reiniciar Tiempos con este Texto</span>
                  </button>
                </div>
              </div>

              <textarea
                value={rawLyricsText}
                onChange={(e) => {
                  const nextText = e.target.value;
                  setRawLyricsText(nextText);
                  setLines((prev) => mergeRawTextWithExistingLines(nextText, prev));
                }}
                rows={11}
                placeholder="Pega aquí la letra de la canción..."
                className="w-full flex-1 p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 font-medium leading-relaxed focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------
            MODO 2: SINCRONIZACIÓN DE LÍNEAS (ESTILO TELEPROMPTER)
        ------------------------------------------------------------------ */}
        {activeMode === 'lineSync' && (
          <div className="flex flex-col gap-4 flex-1">
            {/* Barra de herramientas de Sincronización de Líneas */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    if (audioRef.current && audioRef.current.paused) {
                      audioRef.current.play().catch(() => {});
                      setIsPlaying(true);
                    }
                    stampCurrentLineStart();
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/25 active:scale-95 transition"
                >
                  <CornerDownLeft className="w-4 h-4" />
                  <span>Marcar Inicio de Línea #{activeLineIndex + 1} [Espacio]</span>
                </button>

                <button
                  onClick={() => stampCurrentLineEnd(false)}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-amber-300 flex items-center gap-1.5 transition"
                  title="Cerrar el tiempo final de la línea que acaba de sonar (útil antes de un solo instrumental)"
                >
                  <span>Cerrar Silencio Instrumental [X]</span>
                </button>

                <button
                  onClick={undoLineSync}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-300 flex items-center gap-1.5 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Deshacer y Rebobinar -2s [Backspace]</span>
                </button>
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={lineHoldMode}
                  onChange={(e) => setLineHoldMode(e.target.checked)}
                  className="rounded accent-indigo-500"
                />
                <span>Modo Mantener [Espacio] para definir inicio y fin de línea</span>
              </label>
            </div>

            {/* Lista Teleprompter de Líneas */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex-1 max-h-[56vh] overflow-y-auto space-y-2.5">
              {lines.map((line, idx) => {
                const isTarget = idx === activeLineIndex;
                const isSynced = line.startTime !== null;
                const syncedWordsInLine = line.words.filter((w) => w.startTime !== null).length;

                return (
                  <div
                    key={line.id}
                    ref={(el) => (lineRefs.current[idx] = el)}
                    onClick={() => setActiveLineIndex(idx)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-wrap items-center justify-between gap-3 ${
                      isTarget
                        ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/50 shadow-lg'
                        : isSynced
                        ? 'bg-zinc-900/90 border-emerald-500/30 hover:border-zinc-700'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`w-7 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center shrink-0 ${
                          isTarget
                            ? 'bg-indigo-600 text-white'
                            : isSynced
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {idx + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm sm:text-base font-bold truncate ${
                            isTarget
                              ? 'text-white'
                              : isSynced
                              ? 'text-zinc-100'
                              : 'text-zinc-400'
                          }`}
                        >
                          {line.text}
                        </p>
                        <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400 mt-0.5">
                          <span>
                            Inicio:{' '}
                            <strong className="text-indigo-300">
                              {formatTime(line.startTime)}
                            </strong>
                          </span>
                          <span>→</span>
                          <span>
                            Fin:{' '}
                            <strong className="text-emerald-300">
                              {formatTime(line.endTime)}
                            </strong>
                          </span>
                          <span className="text-zinc-500">
                            • {syncedWordsInLine}/{line.words.length} palabras
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {line.startTime !== null && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            seekTo(Math.max(0, line.startTime - 0.5));
                            if (audioRef.current?.paused) {
                              audioRef.current.play().catch(() => {});
                              setIsPlaying(true);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 font-mono"
                        >
                          ▶ Probar
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setWordSyncSubMode('sniper');
                          setActiveMode('wordSync');
                          const firstUnsyncedWord = line.words.findIndex(
                            (w) => w.startTime === null
                          );
                          const targetW = firstUnsyncedWord !== -1 ? firstUnsyncedWord : 0;
                          triggerPreRollPlay(idx, targetW);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/40 text-xs font-semibold text-indigo-300 hover:text-white transition flex items-center gap-1.5"
                        title="Abrir estudio de línea aislada con Pre-Roll (cuenta regresiva para reflejos y sincronización palabra a palabra sin prisa)"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        <span>🎯 Afinar con Pre-Roll</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------
            MODO 3: SINCRONIZACIÓN PALABRA POR PALABRA (CON PRE-ROLL Y MODO FRANCOTIRADOR)
        ------------------------------------------------------------------ */}
        {activeMode === 'wordSync' &&
          (() => {
            const { lineStart, lineEnd, windowStart, windowEnd } =
              getActiveLineWindow(activeLineIndex);
            const isInPreRoll =
              currentTime >= windowStart - 0.05 && currentTime < lineStart - 0.02;
            const preRollRemaining = Math.max(0, lineStart - currentTime);
            const preRollProgressPct = Math.min(
              100,
              Math.max(
                0,
                ((currentTime - windowStart) / Math.max(0.1, lineStart - windowStart)) * 100
              )
            );
            const activeLineObj = lines[activeLineIndex];
            const currentTargetWordObj = activeLineObj?.words?.[activeWordIndex];
            const prevWordObj =
              activeWordIndex > 0 ? activeLineObj?.words?.[activeWordIndex - 1] : null;
            const nextWordObj =
              activeLineObj && activeWordIndex < activeLineObj.words.length - 1
                ? activeLineObj.words[activeWordIndex + 1]
                : null;

            return (
              <div className="flex flex-col gap-4 flex-1">
                {/* PANEL DE MODO DE CAPTURA */}
                <div className="bg-zinc-900/95 border border-zinc-800 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
                    {[
                      {
                        id: 'sniper',
                        label: '🎯 1 Palabra por Pasada (Pre-Roll)',
                        desc: 'Sin estrés: escucha el Pre-Roll y marca solo 1 palabra objetivo',
                      },
                      {
                        id: 'isolatedLine',
                        label: '🔁 Ráfaga de Línea Aislada',
                        desc: 'Solo esta línea con Pre-Roll y parada automática al final',
                      },
                      {
                        id: 'tap',
                        label: '⚡ Continuo (Toda la canción)',
                        desc: 'Avanza línea tras línea sin detenerse',
                      },
                      {
                        id: 'hold',
                        label: '🎹 Mantener Sílabas (Hold)',
                        desc: 'Mantén presionado Espacio durante cada palabra',
                      },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setWordSyncSubMode(mode.id)}
                        title={mode.desc}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                          wordSyncSubMode === mode.id
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  {/* Controles de Tiempo de Pre-Roll + Ritmo + Bucle */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center bg-zinc-950 px-2.5 py-1 rounded-xl border border-zinc-800 gap-1.5">
                      <Timer className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px] text-zinc-400">Pre-Roll:</span>
                      {[1.5, 2.0, 2.5, 3.0, 4.0].map((sec) => (
                        <button
                          key={sec}
                          onClick={() => setPreRollSeconds(sec)}
                          className={`px-1.5 py-0.5 rounded text-xs font-mono transition ${
                            preRollSeconds === sec
                              ? 'bg-amber-500 text-zinc-950 font-bold'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center bg-zinc-950 px-2.5 py-1 rounded-xl border border-zinc-800 gap-1">
                      <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[11px] text-zinc-400">Ritmo:</span>
                      {[0.5, 0.75, 1.0].map((spd) => (
                        <button
                          key={spd}
                          onClick={() => changeSpeed(spd)}
                          className={`px-1.5 py-0.5 rounded text-xs font-mono transition ${
                            playbackRate === spd
                              ? 'bg-emerald-600 text-white font-bold'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setAutoLoopIsolatedLine(!autoLoopIsolatedLine)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${
                        autoLoopIsolatedLine
                          ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span>Bucle Línea</span>
                    </button>
                  </div>
                </div>

                {/* TARJETA DE ENFOQUE DE LA LÍNEA AISLADA + SEMÁFORO DE PRE-ROLL */}
                <div className="bg-gradient-to-b from-zinc-900 to-zinc-900/95 border border-indigo-500/40 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => {
                          const prevL = Math.max(0, activeLineIndex - 1);
                          setActiveLineIndex(prevL);
                          setActiveWordIndex(0);
                          setSelectedInspectorWord({ lineIdx: prevL, wordIdx: 0 });
                        }}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        title="Línea anterior"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <span className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-mono font-bold">
                        Línea #{activeLineIndex + 1} / {lines.length}
                      </span>
                      <button
                        onClick={() => {
                          const nextL = Math.min(lines.length - 1, activeLineIndex + 1);
                          setActiveLineIndex(nextL);
                          setActiveWordIndex(0);
                          setSelectedInspectorWord({ lineIdx: nextL, wordIdx: 0 });
                        }}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        title="Siguiente línea"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      {/* Frase completa visible junto al índice y las marcas de tiempo */}
                      <span className="px-3 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-sm sm:text-base font-bold text-white">
                        “{activeLineObj?.text || 'Sin texto en esta línea'}”
                      </span>

                      <span className="text-xs text-zinc-400 font-mono">
                        Ventana: {formatTime(lineStart)} → {formatTime(lineEnd)} (Pre-Roll desde{' '}
                        {formatTime(windowStart)})
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() =>
                          triggerPreRollPlay(
                            activeLineIndex,
                            wordSyncSubMode === 'isolatedLine' ? 0 : activeWordIndex
                          )
                        }
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Lanzar con Pre-Roll (-{preRollSeconds}s) [Tecla R]</span>
                      </button>

                      <button
                        onClick={() => distributeWordsEvenlyInLine(activeLineIndex)}
                        className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-emerald-300 font-medium flex items-center gap-1.5 transition"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Auto-Repartir Base</span>
                      </button>
                    </div>
                  </div>

                  {/* VISOR GIGANTE DE PALABRA OBJETIVO (SPOTLIGHT DE SINCRONIZACIÓN) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center bg-zinc-950/90 border border-indigo-500/30 rounded-2xl p-4">
                    {/* Palabra Anterior */}
                    <div className="flex flex-col items-center md:items-start justify-center px-3 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                        Palabra Anterior {prevWordObj ? `(#${activeWordIndex})` : ''}
                      </span>
                      <span className="text-base sm:text-lg font-bold text-zinc-300 truncate max-w-full mt-0.5">
                        {prevWordObj ? prevWordObj.text : '— Inicio de línea —'}
                      </span>
                      <span className="text-[11px] font-mono text-emerald-400">
                        {prevWordObj?.startTime !== null && prevWordObj?.startTime !== undefined
                          ? `${prevWordObj.startTime.toFixed(2)}s → ${(
                              prevWordObj.endTime ?? prevWordObj.startTime + 0.35
                            ).toFixed(2)}s`
                          : 'Sin marca'}
                      </span>
                    </div>

                    {/* PALABRA OBJETIVO EN GRANDE */}
                    <div className="flex flex-col items-center justify-center px-4 py-3 rounded-2xl bg-gradient-to-b from-indigo-950/80 to-zinc-900 border-2 border-indigo-400 shadow-lg shadow-indigo-600/20 text-center">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-mono font-bold uppercase tracking-wider">
                          Palabra Objetivo #{activeWordIndex + 1} de{' '}
                          {activeLineObj?.words?.length || 0}
                        </span>
                      </div>
                      <div className="text-2xl sm:text-4xl font-black tracking-tight text-white py-1">
                        “{currentTargetWordObj?.text || '---'}”
                      </div>
                      <div className="text-xs font-mono text-indigo-200 mt-0.5">
                        {currentTargetWordObj?.startTime !== null &&
                        currentTargetWordObj?.startTime !== undefined
                          ? `Marcada: ${currentTargetWordObj.startTime.toFixed(2)}s → ${(
                              currentTargetWordObj.endTime ??
                              currentTargetWordObj.startTime + 0.35
                            ).toFixed(2)}s`
                          : 'Pendiente — Presiona [ESPACIO] cuando suene esta palabra'}
                      </div>
                    </div>

                    {/* Palabra Siguiente */}
                    <div className="flex flex-col items-center md:items-end justify-center px-3 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                        Siguiente Palabra {nextWordObj ? `(#${activeWordIndex + 2})` : ''}
                      </span>
                      <span className="text-base sm:text-lg font-bold text-zinc-300 truncate max-w-full mt-0.5">
                        {nextWordObj ? nextWordObj.text : '— Fin de línea —'}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400">
                        {nextWordObj?.startTime !== null && nextWordObj?.startTime !== undefined
                          ? `${nextWordObj.startTime.toFixed(2)}s → ${(
                              nextWordObj.endTime ?? nextWordObj.startTime + 0.35
                            ).toFixed(2)}s`
                          : 'En espera'}
                      </span>
                    </div>
                  </div>

                  {/* SEMÁFORO VISUAL DE CUENTA REGRESIVA (PRE-ROLL DE REFLEJOS) */}
                  <div className="bg-zinc-950 border border-zinc-800/90 rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            isInPreRoll
                              ? 'bg-amber-400 animate-ping'
                              : currentTime >= lineStart && currentTime <= lineEnd
                              ? 'bg-emerald-400'
                              : 'bg-zinc-600'
                          }`}
                        />
                        <span className="font-bold tracking-wide uppercase text-zinc-200">
                          {isInPreRoll
                            ? `⚡ PREPÁRATE PARA MARCAR “${
                                currentTargetWordObj?.text || ''
                              }” EN... ${preRollRemaining.toFixed(1)}s`
                            : currentTime >= lineStart && currentTime <= lineEnd
                            ? `🎤 ¡SONANDO LÍNEA! PULSA [ESPACIO] AL ESCUCHAR “${
                                currentTargetWordObj?.text || ''
                              }”`
                            : 'Pulsa [R] o "Lanzar con Pre-Roll" para escuchar unos segundos antes de la frase'}
                        </span>
                      </div>
                      <span className="font-mono text-amber-400 font-semibold">
                        {isInPreRoll
                          ? `Cuenta regresiva: -${preRollRemaining.toFixed(2)}s`
                          : `Inicio frase: ${formatTime(lineStart)}`}
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                      <div
                        className={`h-full transition-all duration-75 ${
                          isInPreRoll
                            ? 'bg-gradient-to-r from-amber-500 via-orange-400 to-emerald-400'
                            : currentTime >= lineStart && currentTime <= lineEnd
                            ? 'bg-emerald-500'
                            : 'bg-zinc-700'
                        }`}
                        style={{
                          width: isInPreRoll
                            ? `${preRollProgressPct}%`
                            : currentTime >= lineStart
                            ? '100%'
                            : '0%',
                        }}
                      />
                    </div>
                  </div>

                  {/* Opciones Exclusivas del Modo Francotirador (1 Palabra por Pasada) */}
                  {wordSyncSubMode === 'sniper' && (
                    <div className="bg-indigo-950/25 border border-indigo-500/30 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-indigo-200">
                        <Crosshair className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span>
                          <strong>Modo 1 Palabra por Pasada:</strong> Concéntrate únicamente en la
                          palabra{' '}
                          <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold">
                            “{currentTargetWordObj?.text || ''}”
                          </span>{' '}
                          (#{activeWordIndex + 1} de {activeLineObj?.words?.length || 0}). No
                          tienes que ir rápido.
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={sniperAutoAdvancePreRoll}
                            onChange={(e) => setSniperAutoAdvancePreRoll(e.target.checked)}
                            className="rounded accent-indigo-500"
                          />
                          <span>Auto-rebobinar al Pre-Roll tras capturar cada palabra</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={sniperHoldDuration}
                            onChange={(e) => setSniperHoldDuration(e.target.checked)}
                            className="rounded accent-indigo-500"
                          />
                          <span>Mantener Espacio para definir también el fin de la palabra</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Píldoras Interactivas de Palabras de la Línea Activa */}
                  <div className="py-3 flex flex-wrap items-center justify-center gap-3.5 min-h-[110px]">
                    {activeLineObj?.words.map((word, wIdx) => {
                      const isCurrentTarget = wIdx === activeWordIndex;
                      const isSynced = word.startTime !== null;
                      const isPlayingNow =
                        isSynced &&
                        currentTime >= word.startTime &&
                        currentTime <= (word.endTime ?? word.startTime + 0.45);
                      const displayWord =
                        word.text ||
                        activeLineObj.text.split(/\s+/).filter(Boolean)[wIdx] ||
                        `Palabra ${wIdx + 1}`;

                      return (
                        <button
                          key={word.id}
                          onClick={() => {
                            setActiveWordIndex(wIdx);
                            setSelectedInspectorWord({ lineIdx: activeLineIndex, wordIdx: wIdx });
                          }}
                          onDoubleClick={() => {
                            triggerPreRollPlay(activeLineIndex, wIdx);
                          }}
                          className={`group relative px-5 py-3.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center min-w-[120px] ${
                            isCurrentTarget
                              ? 'bg-indigo-600/40 border-indigo-400 ring-2 ring-indigo-500/70 scale-105 shadow-xl shadow-indigo-600/25'
                              : isPlayingNow
                              ? 'bg-amber-500/30 border-amber-400 scale-105'
                              : isSynced
                              ? 'bg-emerald-950/40 border-emerald-500/50 hover:border-emerald-400'
                              : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'
                          }`}
                        >
                          {isCurrentTarget && (
                            <span className="mb-1 px-2 py-0.5 rounded-full bg-indigo-500 text-[9px] font-bold uppercase tracking-wider text-white shadow">
                              OBJETIVO [ESPACIO]
                            </span>
                          )}

                          <span className="text-[11px] font-mono text-zinc-400">
                            Palabra #{wIdx + 1}
                          </span>

                          {/* Texto de la palabra en grande y alto contraste */}
                          <span
                            className={`text-xl sm:text-2xl font-extrabold tracking-tight my-1 ${
                              isCurrentTarget
                                ? 'text-white'
                                : isPlayingNow
                                ? 'text-amber-200'
                                : isSynced
                                ? 'text-emerald-200'
                                : 'text-zinc-100'
                            }`}
                          >
                            {displayWord}
                          </span>

                          <span className="text-[11px] font-mono text-zinc-300 bg-zinc-950/80 px-2 py-0.5 rounded-md border border-zinc-800">
                            {word.startTime !== null
                              ? `${word.startTime.toFixed(2)}s → ${(
                                  word.endTime ?? word.startTime + 0.35
                                ).toFixed(2)}s`
                              : 'Sin marca'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* ZOOM DE ONDA EXCLUSIVO DE LA LÍNEA ACTIVA CON MANEJADORES ARRASTRABLES */}
                  <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span className="flex items-center gap-1.5 font-medium text-zinc-300">
                        <ZoomIn className="w-3.5 h-3.5 text-indigo-400" />
                        <span>
                          Lupa de Onda de Línea #{activeLineIndex + 1} (Haz clic para escuchar o
                          arrastra bordes de cada palabra)
                        </span>
                      </span>
                      <span className="font-mono text-zinc-500">
                        {formatTime(windowStart)} — {formatTime(windowEnd)}
                      </span>
                    </div>

                    <div
                      className="relative w-full h-20 bg-zinc-900/70 rounded-lg border border-zinc-800 overflow-hidden cursor-pointer select-none"
                      onClick={(e) => {
                        if (draggingWordHandle) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        const targetTime = windowStart + ratio * (windowEnd - windowStart);
                        seekTo(targetTime);
                        if (audioRef.current?.paused) {
                          audioRef.current.play().catch(() => {});
                          setIsPlaying(true);
                        }
                      }}
                    >
                      <canvas ref={zoomWaveformCanvasRef} className="w-full h-full block" />

                      {lines[activeLineIndex]?.words.map((w, wIdx) => {
                        if (w.startTime === null) return null;
                        const span = Math.max(0.5, windowEnd - windowStart);
                        const startPct = ((w.startTime - windowStart) / span) * 100;
                        const endT = w.endTime !== null ? w.endTime : w.startTime + 0.35;
                        const endPct = ((endT - windowStart) / span) * 100;

                        return (
                          <React.Fragment key={`handle-${w.id}`}>
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setActiveWordIndex(wIdx);
                                setSelectedInspectorWord({
                                  lineIdx: activeLineIndex,
                                  wordIdx: wIdx,
                                });
                                setDraggingWordHandle({
                                  lineIdx: activeLineIndex,
                                  wordIdx: wIdx,
                                  edge: 'start',
                                });
                              }}
                              style={{ left: `${Math.max(0, Math.min(99, startPct))}%` }}
                              className="absolute top-4 bottom-1 w-2 -ml-1 bg-indigo-400/80 hover:bg-amber-400 cursor-ew-resize rounded-sm z-10 transition-colors"
                              title={`Arrastrar inicio de "${w.text}" (${w.startTime.toFixed(2)}s)`}
                            />
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setActiveWordIndex(wIdx);
                                setSelectedInspectorWord({
                                  lineIdx: activeLineIndex,
                                  wordIdx: wIdx,
                                });
                                setDraggingWordHandle({
                                  lineIdx: activeLineIndex,
                                  wordIdx: wIdx,
                                  edge: 'end',
                                });
                              }}
                              style={{ left: `${Math.max(0, Math.min(99, endPct))}%` }}
                              className="absolute top-4 bottom-1 w-2 -ml-1 bg-emerald-400/80 hover:bg-amber-400 cursor-ew-resize rounded-sm z-10 transition-colors"
                              title={`Arrastrar fin de "${w.text}" (${endT.toFixed(2)}s)`}
                            />
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  {/* Botones Grandes de Acción para Capturar Palabra o Ensayar con Pre-Roll */}
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                    <button
                      onClick={() => triggerPreRollPlay(activeLineIndex, activeWordIndex)}
                      className="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 font-semibold text-sm flex items-center gap-2 transition"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>1º Escuchar desde Pre-Roll [R]</span>
                    </button>

                    <button
                      onMouseDown={() => {
                        if (audioRef.current && audioRef.current.paused) {
                          audioRef.current.play().catch(() => {});
                          setIsPlaying(true);
                        }
                        stampWordStart();
                      }}
                      onMouseUp={() => {
                        if (
                          wordSyncSubMode === 'hold' ||
                          (wordSyncSubMode === 'sniper' && sniperHoldDuration)
                        ) {
                          stampWordEndOnRelease();
                        }
                      }}
                      className="px-7 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {wordSyncSubMode === 'sniper'
                          ? `2º Capturar SOLO "${currentTargetWordObj?.text || ''}" [ESPACIO]`
                          : wordSyncSubMode === 'isolatedLine'
                          ? `Marcar "${currentTargetWordObj?.text || ''}" en Línea Aislada [ESPACIO]`
                          : `Marcar Palabra "${currentTargetWordObj?.text || ''}" [ESPACIO]`}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Inspector de Micro-Ajuste de Precisión (+10ms / -10ms / +50ms / -50ms) */}
                {inspectedWord && (
                  <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Sliders className="w-4 h-4 text-indigo-400" />
                      <div>
                        <span className="text-xs text-zinc-400">Inspector de Precisión:</span>
                        <span className="ml-2 px-2.5 py-0.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-200 font-bold text-sm">
                          “{inspectedWord.text}”
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      {/* Ajuste de Inicio */}
                      <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
                        <span className="text-xs text-zinc-400 mr-1">Inicio:</span>
                        <button
                          onClick={() =>
                            nudgeWordTime(
                              selectedInspectorWord.lineIdx,
                              selectedInspectorWord.wordIdx,
                              'startTime',
                              -0.05
                            )
                          }
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono"
                        >
                          -50ms
                        </button>
                        <button
                          onClick={() =>
                            nudgeWordTime(
                              selectedInspectorWord.lineIdx,
                              selectedInspectorWord.wordIdx,
                              'startTime',
                              -0.01
                            )
                          }
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono"
                        >
                          -10ms
                        </button>
                        <span className="px-2 font-mono text-xs font-bold text-indigo-300">
                          {inspectedWord.startTime !== null
                            ? `${inspectedWord.startTime.toFixed(3)}s`
                            : '--'}
                        </span>
                        <button
                          onClick={() =>
                            nudgeWordTime(
                              selectedInspectorWord.lineIdx,
                              selectedInspectorWord.wordIdx,
                              'startTime',
                              0.01
                            )
                          }
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono"
                        >
                          +10ms
                        </button>
                        <button
                          onClick={() =>
                            nudgeWordTime(
                              selectedInspectorWord.lineIdx,
                              selectedInspectorWord.wordIdx,
                              'startTime',
                              0.05
                            )
                          }
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono"
                        >
                          +50ms
                        </button>
                      </div>

                      {/* Ajuste de Fin */}
                      <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
                        <span className="text-xs text-zinc-400 mr-1">Fin:</span>
                        <button
                          onClick={() =>
                            nudgeWordTime(
                              selectedInspectorWord.lineIdx,
                              selectedInspectorWord.wordIdx,
                              'endTime',
                              -0.05
                            )
                          }
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono"
                        >
                          -50ms
                        </button>
                        <span className="px-2 font-mono text-xs font-bold text-emerald-300">
                          {inspectedWord.endTime !== null
                            ? `${inspectedWord.endTime.toFixed(3)}s`
                            : '--'}
                        </span>
                        <button
                          onClick={() =>
                            nudgeWordTime(
                              selectedInspectorWord.lineIdx,
                              selectedInspectorWord.wordIdx,
                              'endTime',
                              0.05
                            )
                          }
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono"
                        >
                          +50ms
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lista de Todas las Líneas para Saltar Rápidamente */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 max-h-[28vh] overflow-y-auto space-y-2">
                  {lines.map((line, lIdx) => {
                    const syncedCount = line.words.filter((w) => w.startTime !== null).length;
                    const isSelected = lIdx === activeLineIndex;
                    return (
                      <div
                        key={line.id}
                        onClick={() => {
                          setActiveLineIndex(lIdx);
                          setActiveWordIndex(0);
                          setSelectedInspectorWord({ lineIdx: lIdx, wordIdx: 0 });
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-indigo-950/30 border-indigo-500/60'
                            : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-mono text-zinc-500 w-6">#{lIdx + 1}</span>
                          <div className="flex flex-wrap gap-1.5">
                            {line.words.map((w, wIdx) => (
                              <span
                                key={w.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveLineIndex(lIdx);
                                  setActiveWordIndex(wIdx);
                                  setSelectedInspectorWord({ lineIdx: lIdx, wordIdx: wIdx });
                                }}
                                className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                                  lIdx === activeLineIndex && wIdx === activeWordIndex
                                    ? 'bg-indigo-600 text-white'
                                    : w.startTime !== null
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-zinc-900 text-zinc-400'
                                }`}
                              >
                                {w.text}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-mono text-zinc-400">
                            {syncedCount}/{line.words.length} palabras
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerPreRollPlay(lIdx, 0);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/30 text-[11px] font-semibold text-amber-300 flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Pre-Roll</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

        {/* ------------------------------------------------------------------
            MODO 4: VISTA PREVIA KARAOKE EN VIVO (APPLE MUSIC) Y EXPORTACIÓN JSON
        ------------------------------------------------------------------ */}
        {activeMode === 'preview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
            {/* Reproductor Karaoke Estilo Apple Music / Musixmatch */}
            <div className="lg:col-span-6 bg-gradient-to-br from-indigo-950/50 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between max-h-[64vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                    Vista Previa Karaoke Rich-Sync (60 FPS)
                  </span>
                </div>
                <span className="text-xs font-mono text-indigo-300">{formatTime(currentTime)}</span>
              </div>

              <div className="py-6 space-y-5 overflow-y-auto pr-2">
                {lines.map((line, lIdx) => {
                  const isActiveLine = lIdx === currentPlayingLineIndex;
                  const isPastLine = line.endTime !== null && currentTime > line.endTime;

                  return (
                    <div
                      key={line.id}
                      ref={(el) => (previewRefs.current[lIdx] = el)}
                      onClick={() => {
                        if (line.startTime !== null) seekTo(line.startTime);
                      }}
                      className={`p-3 rounded-2xl transition-all cursor-pointer ${
                        isActiveLine
                          ? 'bg-white/5 scale-[1.02] shadow-lg'
                          : isPastLine
                          ? 'opacity-45'
                          : 'opacity-65 hover:opacity-90'
                      }`}
                    >
                      <div className="flex flex-wrap gap-x-2 gap-y-1">
                        {line.words.map((w) => {
                          let fillPct = 0;
                          if (w.startTime !== null) {
                            const endT = w.endTime !== null ? w.endTime : w.startTime + 0.35;
                            if (currentTime >= endT) fillPct = 100;
                            else if (currentTime > w.startTime) {
                              fillPct = Math.min(
                                100,
                                Math.max(0, ((currentTime - w.startTime) / (endT - w.startTime)) * 100)
                              );
                            }
                          } else if (isActiveLine && line.startTime !== null) {
                            fillPct = 100;
                          }

                          return (
                            <span
                              key={w.id}
                              className="relative inline-block text-lg sm:text-2xl font-extrabold tracking-tight"
                            >
                              <span className="text-zinc-600 select-none">{w.text}</span>
                              <span
                                className="absolute left-0 top-0 overflow-hidden text-white whitespace-nowrap pointer-events-none"
                                style={{ width: `${fillPct}%` }}
                              >
                                {w.text}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Exportador de Código JSON / ELRC / LRC */}
            <div className="lg:col-span-6 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-3 max-h-[64vh]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  {[
                    { id: 'json', label: 'JSON (Líneas + Palabras)' },
                    { id: 'elrc', label: 'ELRC (Enhanced Karaoke)' },
                    { id: 'lrc', label: 'LRC Estándar' },
                  ].map((fmt) => (
                    <button
                      key={fmt.id}
                      onClick={() => setExportFormat(fmt.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                        exportFormat === fmt.id
                          ? 'bg-indigo-600 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>

                {exportFormat === 'json' && (
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs">
                    <button
                      onClick={() => setJsonTimeUnit('seconds')}
                      className={`px-2 py-1 rounded-lg font-mono ${
                        jsonTimeUnit === 'seconds'
                          ? 'bg-zinc-800 text-indigo-300 font-bold'
                          : 'text-zinc-400'
                      }`}
                    >
                      Segundos (12.340)
                    </button>
                    <button
                      onClick={() => setJsonTimeUnit('ms')}
                      className={`px-2 py-1 rounded-lg font-mono ${
                        jsonTimeUnit === 'ms'
                          ? 'bg-zinc-800 text-indigo-300 font-bold'
                          : 'text-zinc-400'
                      }`}
                    >
                      Milisegundos (12340)
                    </button>
                  </div>
                )}
              </div>

              <pre className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs font-mono text-emerald-300 overflow-auto leading-relaxed">
                {exportedOutput}
              </pre>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(exportedOutput);
                    setCopiedFlag(true);
                    setTimeout(() => setCopiedFlag(false), 2000);
                    triggerToast('Copiado al portapapeles');
                  }}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 flex items-center gap-1.5"
                >
                  {copiedFlag ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  <span>{copiedFlag ? '¡Copiado!' : 'Copiar Código'}</span>
                </button>

                <button
                  onClick={handleDownloadOutput}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar .{exportFormat.toUpperCase()}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ====================================================================
          FOOTER GLOBAL: ONDA DE AUDIO INTERACTIVA Y CONTROLES DE TRANSPORTE
      ==================================================================== */}
      <footer className="border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-md px-4 lg:px-6 py-3 sticky bottom-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col gap-2.5">
          {/* Onda de Audio Interactiva Global */}
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              seekTo(clickRatio * duration);
            }}
            className="relative w-full h-12 bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden cursor-pointer group"
            title="Haz clic en cualquier punto de la onda para saltar en el tiempo"
          >
            <canvas ref={waveformCanvasRef} className="w-full h-full block" />
          </div>

          {/* Controles de Reproducción, Velocidad y Atajos */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 transition"
                title="Reproducir / Pausar [Tecla P]"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>

              <button
                onClick={() => seekTo(currentTime - 2)}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200"
              >
                -2s
              </button>
              <button
                onClick={() => seekTo(currentTime + 2)}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200"
              >
                +2s
              </button>

              <div className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs sm:text-sm">
                <span className="text-amber-400 font-bold">{formatTime(currentTime)}</span>
                <span className="text-zinc-600 mx-1.5">/</span>
                <span className="text-zinc-400">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Selector de Velocidad Pitch-Preserved y Volumen */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                {[0.5, 0.75, 1.0, 1.25].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => changeSpeed(spd)}
                    className={`px-2 py-1 rounded-lg text-xs font-mono transition ${
                      playbackRate === spd
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setShowShortcutsBar(!showShortcutsBar)}
                className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 flex items-center gap-1"
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Atajos</span>
              </button>
            </div>
          </div>

          {showShortcutsBar && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <div className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono text-[11px]">
                  Espacio
                </kbd>
                <span className="text-zinc-300">Marcar palabra objetivo / línea</span>
              </div>

              <div className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[11px]">
                  R
                </kbd>
                <span className="text-zinc-300">
                  Rebobinar al Pre-Roll de la línea (-{preRollSeconds}s) y ensayar
                </span>
              </div>

              <div className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono text-[11px]">
                  ← / →
                </kbd>
                <span className="text-zinc-300">
                  Cambiar Palabra Objetivo (con Shift busca ±0.5s)
                </span>
              </div>

              <div className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono text-[11px]">
                  [ / ]
                </kbd>
                <span className="text-zinc-300">Ajustar palabra ±20ms al vuelo</span>
              </div>

              <div className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono text-[11px]">
                  P
                </kbd>
                <span className="text-zinc-300">Pausar / Reproducir</span>
              </div>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}