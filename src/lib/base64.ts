const CHUNK_SIZE = 0x8000;

/**
 * Convierte un `ArrayBuffer` en una cadena codificada en Base64.
 * Procesa los bytes por bloques para evitar desbordamientos de pila en audios grandes.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength === 0) {
    return '';
  }

  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_SIZE) {
    const slice = bytes.subarray(offset, offset + CHUNK_SIZE);
    chunks.push(String.fromCharCode(...slice));
  }

  return btoa(chunks.join(''));
}

/**
 * Decodifica una cadena Base64 a un `ArrayBuffer`.
 * Lanza un `Error` si la cadena no tiene un formato Base64 válido.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const normalized = base64.trim();
  if (normalized.length === 0) {
    return new ArrayBuffer(0);
  }

  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error('La cadena Base64 del respaldo tiene un formato inválido.');
  }

  let binaryString: string;
  try {
    binaryString = atob(normalized);
  } catch {
    throw new Error('No se pudo decodificar el audio en Base64 del respaldo.');
  }

  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}
