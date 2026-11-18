import { arrayBufferToBase64 } from '@/lib/base64';
import {
  BACKUP_SCHEMA_VERSION,
  type AudioBinary,
  type CatalogBackup,
  type LyricLine,
  type ProjectFullData,
  type ProjectSettings,
  type ProjectSummary,
  type SerializedAudioBackup,
  type WordTiming,
} from '@/types';

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  playbackRate: 1,
  preRollSeconds: 2.5,
  sniperMode: false,
  autoAdvance: true,
};

const MONTH_NAMES_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm',
};

/**
 * Entrada binaria de audio lista para serializarse en un respaldo JSON síncrono.
 */
export interface SingleProjectAudioData {
  buffer: ArrayBuffer;
  fileName: string;
  mimeType?: string;
  peaks: number[];
  duration: number;
}

export type SingleProjectAudioInput =
  | SingleProjectAudioData
  | (AudioBinary & { blob: ArrayBuffer });

/**
 * Genera un identificador único compatible con navegador y Node.
 */
export function createProjectId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `proj-${timestamp}-${random}`;
}

function inferMimeFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

function sanitizeTimestamp(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function sanitizeWordTiming(word: WordTiming): WordTiming {
  const startMs = sanitizeTimestamp(word.startMs);
  const rawEnd = sanitizeTimestamp(word.endMs);
  const endMs = startMs !== null && rawEnd !== null && rawEnd >= startMs ? rawEnd : null;

  return {
    id: word.id,
    text: word.text,
    startMs,
    endMs,
  };
}

function sanitizeLyricLine(line: LyricLine): LyricLine {
  const startMs = sanitizeTimestamp(line.startMs);
  const rawEnd = sanitizeTimestamp(line.endMs);
  const endMs = startMs !== null && rawEnd !== null && rawEnd >= startMs ? rawEnd : null;

  return {
    id: line.id,
    text: line.text,
    startMs,
    endMs,
    words: line.words.map(sanitizeWordTiming),
  };
}

function computeProgressCounts(lines: LyricLine[]): Pick<
  ProjectSummary,
  'totalLines' | 'syncedLines' | 'totalWords' | 'syncedWords' | 'lineProgress' | 'wordProgress'
> {
  const totalLines = lines.length;
  const syncedLines = lines.filter((line) => line.startMs !== null).length;
  const totalWords = lines.reduce((sum, line) => sum + line.words.length, 0);
  const syncedWords = lines.reduce(
    (sum, line) => sum + line.words.filter((word) => word.startMs !== null).length,
    0,
  );

  const lineProgress = totalLines > 0 ? Math.round((syncedLines / totalLines) * 100) : 0;
  const wordProgress = totalWords > 0 ? Math.round((syncedWords / totalWords) * 100) : 0;

  return {
    totalLines,
    syncedLines,
    totalWords,
    syncedWords,
    lineProgress,
    wordProgress,
  };
}

/**
 * Crea un proyecto vacío sin audio asociado y con un identificador único.
 */
export function createEmptyProject(
  title: string,
  artist: string,
  now: number = Date.now(),
  id: string = createProjectId(),
): ProjectFullData {
  const cleanTitle = title.trim() || 'Sin título';
  const cleanArtist = artist.trim();

  return {
    id,
    title: cleanTitle,
    artist: cleanArtist,
    audioFileName: '',
    durationMs: 0,
    totalLines: 0,
    syncedLines: 0,
    totalWords: 0,
    syncedWords: 0,
    lineProgress: 0,
    wordProgress: 0,
    lines: [],
    waveformPeaks: [],
    settings: { ...DEFAULT_PROJECT_SETTINGS },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Duplica un proyecto existente con un nuevo identificador, título con sufijo `(copia)`
 * y limpieza de marcas temporales corruptas o incoherentes.
 */
export function duplicateProject(
  project: ProjectFullData,
  newId: string,
  now: number = Date.now(),
): ProjectFullData {
  const cleanLines = project.lines.map(sanitizeLyricLine);
  const counts = computeProgressCounts(cleanLines);

  return {
    ...project,
    id: newId,
    title: `${project.title} (copia)`,
    ...counts,
    lines: cleanLines,
    waveformPeaks: [...project.waveformPeaks],
    settings: { ...project.settings },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Convierte un `AudioBinary` en datos listos para serializar en un respaldo JSON.
 */
export async function toSingleProjectAudioData(
  audio: AudioBinary,
): Promise<SingleProjectAudioData> {
  if (audio.blob instanceof ArrayBuffer) {
    return {
      buffer: audio.blob,
      fileName: audio.fileName,
      mimeType: inferMimeFromFileName(audio.fileName),
      peaks: [...audio.peaks],
      duration: audio.duration,
    };
  }

  const buffer = await audio.blob.arrayBuffer();
  return {
    buffer,
    fileName: audio.fileName,
    mimeType: audio.blob.type || inferMimeFromFileName(audio.fileName),
    peaks: [...audio.peaks],
    duration: audio.duration,
  };
}

/**
 * Genera el nombre de archivo sugerido `<titulo>-respaldo.json` para exportar un proyecto.
 */
export function buildBackupFileName(title: string): string {
  const sanitized = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const baseName = sanitized || 'transcripcion';
  return `${baseName}-respaldo.json`;
}

/**
 * Construye una cadena JSON con el formato `CatalogBackup` para un único proyecto.
 */
export function buildSingleProjectBackup(
  project: ProjectFullData,
  audio?: SingleProjectAudioInput | null,
  exportedAt: number = Date.now(),
): string {
  const audios: SerializedAudioBackup[] = [];

  if (audio) {
    const buffer = 'buffer' in audio ? audio.buffer : audio.blob;
    const mimeType =
      ('mimeType' in audio && audio.mimeType) || inferMimeFromFileName(audio.fileName);

    audios.push({
      projectId: project.id,
      fileName: audio.fileName,
      mimeType,
      base64: arrayBufferToBase64(buffer),
      peaks: [...audio.peaks],
      duration: audio.duration,
    });
  }

  const backup: CatalogBackup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    projects: [project],
    audios,
  };

  return JSON.stringify(backup);
}

function padTwo(value: number): string {
  return value.toString().padStart(2, '0');
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Formatea una marca temporal en fecha relativa en español (`hace 3 min`, `ayer 22:10`, `12 nov`).
 */
export function formatRelativeDate(updatedAt: number, now: number = Date.now()): string {
  if (!Number.isFinite(updatedAt)) {
    return 'hace un momento';
  }

  const diffMs = Math.max(0, now - updatedAt);
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return 'hace un momento';
  }
  if (diffMinutes < 60) {
    return `hace ${diffMinutes} min`;
  }

  const updatedDate = new Date(updatedAt);
  const nowDate = new Date(now);

  if (isSameCalendarDay(updatedDate, nowDate)) {
    const diffHours = Math.floor(diffMs / 3_600_000);
    return `hace ${diffHours} h`;
  }

  const yesterdayDate = new Date(nowDate);
  yesterdayDate.setDate(nowDate.getDate() - 1);

  if (isSameCalendarDay(updatedDate, yesterdayDate)) {
    return `ayer ${padTwo(updatedDate.getHours())}:${padTwo(updatedDate.getMinutes())}`;
  }

  const day = updatedDate.getDate();
  const month = MONTH_NAMES_ES[updatedDate.getMonth()] ?? 'ene';

  if (updatedDate.getFullYear() !== nowDate.getFullYear()) {
    return `${day} ${month} ${updatedDate.getFullYear()}`;
  }

  return `${day} ${month}`;
}

function normalizeSearchText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Filtra una lista de resúmenes de proyectos por coincidencia en título o artista.
 */
export function filterProjectsByQuery(
  projects: ProjectSummary[],
  query: string,
): ProjectSummary[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return projects;
  }

  return projects.filter((project) => {
    const title = normalizeSearchText(project.title);
    const artist = normalizeSearchText(project.artist);
    return title.includes(normalizedQuery) || artist.includes(normalizedQuery);
  });
}
