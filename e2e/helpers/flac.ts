/**
 * Generador mínimo de archivos FLAC válidos en memoria para pruebas E2E.
 * Produce un tono sinusoidal de 440 Hz a 44100 Hz, mono, 16 bits, con tramas
 * verbatim y sumas de verificación CRC-8 y CRC-16 conformes a la especificación FLAC.
 */

function crc8Flac(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0;
  for (let i = start; i < end; i++) {
    crc ^= bytes[i] ?? 0;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x80) !== 0) {
        crc = ((crc << 1) ^ 0x07) & 0xff;
      } else {
        crc = (crc << 1) & 0xff;
      }
    }
  }
  return crc;
}

function crc16Flac(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0;
  for (let i = start; i < end; i++) {
    crc ^= (bytes[i] ?? 0) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x8005) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

function encodeUtf8FrameNumber(n: number): number[] {
  if (n < 0x80) {
    return [n];
  }
  if (n < 0x800) {
    return [0xc0 | (n >> 6), 0x80 | (n & 0x3f)];
  }
  return [0xe0 | (n >> 12), 0x80 | ((n >> 6) & 0x3f), 0x80 | (n & 0x3f)];
}

/**
 * Genera un archivo FLAC válido en memoria de `durationSeconds` segundos (por defecto 1 s)
 * a 44100 Hz, mono, 16 bits por muestra.
 */
export function createTinyFlacBytes(durationSeconds = 1): Uint8Array {
  const sampleRate = 44_100;
  const channels = 1;
  const bitsPerSample = 16;
  const blockSize = 4_410; // 10 tramas exactas por segundo
  const safeSeconds = Math.max(1, Math.floor(durationSeconds));
  const frameCount = safeSeconds * 10;
  const totalSamples = frameCount * blockSize;

  // 4 bytes 'fLaC' + 4 bytes cabecera STREAMINFO + 34 bytes cuerpo STREAMINFO
  const headerLen = 4 + 4 + 34;
  // Cada trama: 4 bytes base + utf8(frameNumber) + 2 bytes blocksize + 1 byte CRC-8 + 1 byte subcabecera + blockSize*2 bytes PCM + 2 bytes CRC-16
  const maxFrameSize = 4 + 3 + 2 + 1 + 1 + blockSize * 2 + 2;
  const buffer = new ArrayBuffer(headerLen + frameCount * maxFrameSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Marcador 'fLaC'
  bytes[0] = 0x66;
  bytes[1] = 0x4c;
  bytes[2] = 0x61;
  bytes[3] = 0x43;

  // Bloque STREAMINFO (último bloque de metadatos = 1, tipo = 0 -> 0x80, longitud = 34)
  bytes[4] = 0x80;
  bytes[5] = 0x00;
  bytes[6] = 0x00;
  bytes[7] = 0x22;

  // minBlockSize / maxBlockSize
  view.setUint16(8, blockSize, false);
  view.setUint16(10, blockSize, false);
  // minFrameSize / maxFrameSize (0 = desconocido)
  view.setUint16(12, 0, false);
  bytes[14] = 0;
  view.setUint16(15, 0, false);
  bytes[17] = 0;

  // 64 bits empaquetados: sampleRate (20), channels-1 (3), bps-1 (5), totalSamples (36)
  const packedHigh =
    ((sampleRate & 0xfffff) << 12) |
    (((channels - 1) & 0x7) << 9) |
    (((bitsPerSample - 1) & 0x1f) << 4) |
    Math.floor(totalSamples / 0x1_0000_0000);
  const packedLow = totalSamples >>> 0;
  view.setUint32(18, packedHigh >>> 0, false);
  view.setUint32(22, packedLow, false);
  // Los 16 bytes de MD5 quedan en 0 (válido según la especificación FLAC).

  let offset = headerLen;
  let globalSample = 0;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const frameStart = offset;

    // Sync code (14 bits: 0x3ffe) + reserved (0) + fixed-blocksize (0) -> 0xfff8
    bytes[offset++] = 0xff;
    bytes[offset++] = 0xf8;
    // Block size code 0b0111 (16-bit blocksize-1 al final) | Sample rate code 0b1001 (44100 Hz)
    bytes[offset++] = 0x79;
    // Channel assignment 0b0000 (1 canal) | Sample size 0b100 (16 bits) | reserved 0
    bytes[offset++] = 0x08;

    // Número de trama en UTF-8
    const utf8Bytes = encodeUtf8FrameNumber(frameIndex);
    for (const b of utf8Bytes) {
      bytes[offset++] = b;
    }

    // (blockSize - 1) en big-endian de 16 bits
    view.setUint16(offset, blockSize - 1, false);
    offset += 2;

    // CRC-8 de la cabecera de trama
    bytes[offset] = crc8Flac(bytes, frameStart, offset);
    offset += 1;

    // Cabecera de subtrama: zero (0) | type VERBATIM (000001) | wasted_bits (0) -> 0x02
    bytes[offset++] = 0x02;

    // Muestras PCM 16-bit signed big-endian
    for (let i = 0; i < blockSize; i++) {
      const t = globalSample / sampleRate;
      const sample = Math.round(Math.sin(2 * Math.PI * 440 * t) * 8_192);
      view.setInt16(offset, sample, false);
      offset += 2;
      globalSample += 1;
    }

    // CRC-16 del pie de trama
    const frameCrc16 = crc16Flac(bytes, frameStart, offset);
    view.setUint16(offset, frameCrc16, false);
    offset += 2;
  }

  return bytes.slice(0, offset);
}
