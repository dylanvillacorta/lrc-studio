import { describe, expect, it } from 'vitest';
import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';

describe('utilidades base64', () => {
  it('codifica y decodifica un ArrayBuffer vacío', () => {
    const empty = new ArrayBuffer(0);
    const encoded = arrayBufferToBase64(empty);
    expect(encoded).toBe('');

    const decoded = base64ToArrayBuffer(encoded);
    expect(decoded.byteLength).toBe(0);
  });

  it('preserva todos los valores de byte (0..255) en ida y vuelta', () => {
    const original = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) {
      original[i] = i;
    }

    const encoded = arrayBufferToBase64(original.buffer);
    const decoded = new Uint8Array(base64ToArrayBuffer(encoded));

    expect(decoded).toEqual(original);
  });

  it('maneja buffers grandes mayores al tamaño de bloque sin desbordar la pila', () => {
    const size = 100_000;
    const original = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) {
      original[i] = i % 251;
    }

    const encoded = arrayBufferToBase64(original.buffer);
    const decoded = new Uint8Array(base64ToArrayBuffer(encoded));

    expect(decoded.byteLength).toBe(size);
    expect(decoded).toEqual(original);
  });

  it('lanza un Error en español si la cadena base64 es inválida', () => {
    expect(() => base64ToArrayBuffer('no-es-base64!')).toThrow(/Base64/i);
    expect(() => base64ToArrayBuffer('abc')).toThrow(/Base64/i);
  });
});
