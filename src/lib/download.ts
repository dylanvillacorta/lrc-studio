const WINDOWS_FORBIDDEN_RE = /[<>:"/\\|?*\u0000-\u001f]/g;
const MAX_FILENAME_LENGTH = 120;

/**
 * Sanea un nombre de archivo para que sea seguro en Windows, macOS y Linux.
 * Elimina caracteres prohibidos, colapsa espacios y limita la longitud a 120 caracteres.
 */
export function sanitizeFileName(text: string): string {
  const cleaned = text
    .replace(WINDOWS_FORBIDDEN_RE, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');

  if (cleaned.length === 0) {
    return 'archivo';
  }

  if (cleaned.length <= MAX_FILENAME_LENGTH) {
    return cleaned;
  }

  return cleaned.slice(0, MAX_FILENAME_LENGTH).trimEnd();
}

/**
 * Descarga un archivo de texto en el navegador mediante un Blob y un enlace temporal.
 */
export function downloadTextFile(
  name: string,
  content: string,
  mime = 'text/plain;charset=utf-8',
): void {
  const safeName = sanitizeFileName(name);
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.style.display = 'none';

  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
