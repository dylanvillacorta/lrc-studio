import type { Download, Locator } from '@playwright/test';

type FilePayloadArg = Exclude<Parameters<Locator['setInputFiles']>[0], string | readonly string[]>;

interface RuntimeBufferCtor {
  from(data: Uint8Array | string, encoding?: string): unknown;
}

function getRuntimeBuffer(): RuntimeBufferCtor {
  const buf = (globalThis as unknown as { Buffer?: RuntimeBufferCtor }).Buffer;
  if (!buf) {
    throw new Error('Buffer global no disponible en el entorno de pruebas.');
  }
  return buf;
}

/**
 * Construye un `FilePayload` compatible con `locator.setInputFiles` sin requerir `@types/node`.
 */
export function makeFilePayload(
  name: string,
  mimeType: string,
  content: Uint8Array | string,
): FilePayloadArg {
  const buf = getRuntimeBuffer();
  const buffer =
    typeof content === 'string' ? buf.from(content, 'utf8') : buf.from(content);
  return {
    name,
    mimeType,
    buffer,
  } as FilePayloadArg;
}

/**
 * Lee el contenido textual de una descarga de Playwright mediante su stream.
 */
export async function readDownloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) {
    throw new Error('La descarga no devolvió un stream legible.');
  }
  const decoder = new TextDecoder('utf-8');
  let text = '';
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  return text;
}

/**
 * Genera un archivo WAV PCM mono de 16 bits válido en memoria para pruebas E2E.
 */
export function createTinyWavBytes(durationSeconds = 2): Uint8Array {
  const sampleRate = 22_050;
  const safeSeconds = Math.max(1, Math.floor(durationSeconds));
  const numSamples = safeSeconds * sampleRate;
  const arrayBuffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(arrayBuffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.25;
    view.setInt16(44 + i * 2, Math.round(sample * 32_767), true);
  }

  return new Uint8Array(arrayBuffer);
}
