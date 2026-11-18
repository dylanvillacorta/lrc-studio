/**
 * Fuente única de verdad para los formatos de audio soportados por LyricSync Studio.
 */

export const SUPPORTED_AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'flac',
  'ogg',
  'oga',
  'm4a',
  'aac',
  'opus',
  'webm',
] as const;

export type SupportedAudioExtension = (typeof SUPPORTED_AUDIO_EXTENSIONS)[number];

export const AUDIO_MIME_BY_EXTENSION: Readonly<Record<SupportedAudioExtension, string>> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  opus: 'audio/opus',
  webm: 'audio/webm',
};

const MIME_ALIASES: Readonly<Record<string, string>> = {
  'audio/x-flac': 'audio/flac',
};

/**
 * Valor para el atributo `accept` de inputs de audio: combina `audio/*`
 * con las extensiones explícitas para navegadores móviles que no reportan MIME.
 */
export const AUDIO_INPUT_ACCEPT = [
  'audio/*',
  ...SUPPORTED_AUDIO_EXTENSIONS.map((ext) => `.${ext}`),
].join(',');

/**
 * Lista legible de formatos de audio admitidos para mensajes de UI y errores.
 */
export const SUPPORTED_AUDIO_FORMATS_LABEL = SUPPORTED_AUDIO_EXTENSIONS.map((ext) =>
  ext.toUpperCase(),
).join(', ');

/**
 * Mensaje estándar cuando el usuario selecciona un archivo que no es un audio soportado.
 */
export const UNSUPPORTED_AUDIO_FORMAT_MESSAGE = `Formato de archivo no compatible. Formatos de audio admitidos: ${SUPPORTED_AUDIO_FORMATS_LABEL}.`;

function extractExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot < 0 || lastDot === trimmed.length - 1) {
    return '';
  }
  return trimmed.slice(lastDot + 1).toLowerCase();
}

function normalizeDeclaredAudioMime(declaredType?: string): string | null {
  if (!declaredType) {
    return null;
  }
  const base = declaredType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!base.startsWith('audio/')) {
    return null;
  }
  return MIME_ALIASES[base] ?? base;
}

/**
 * Infiere el tipo MIME canónico de un archivo de audio.
 * Prefiere `declaredType` si es `audio/*` (normalizando `audio/x-flac` a `audio/flac`),
 * luego cae a la extensión del nombre (sin distinguir mayúsculas) y finalmente
 * a `application/octet-stream`.
 */
export function inferAudioMime(fileName: string, declaredType?: string): string {
  const normalizedDeclared = normalizeDeclaredAudioMime(declaredType);
  if (normalizedDeclared) {
    return normalizedDeclared;
  }

  const ext = extractExtension(fileName);
  if (ext && ext in AUDIO_MIME_BY_EXTENSION) {
    return AUDIO_MIME_BY_EXTENSION[ext as SupportedAudioExtension];
  }

  return 'application/octet-stream';
}

/**
 * Indica si un archivo corresponde a un formato de audio soportado por extensión o MIME `audio/*`.
 */
export function isSupportedAudioFile(file: { name?: string; type?: string }): boolean {
  return inferAudioMime(file.name ?? '', file.type) !== 'application/octet-stream';
}
