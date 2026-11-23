import { describe, expect, it, vi } from 'vitest';
import {
  PLAYBACK_SAMPLE_RATE,
  choosePcmLayout,
  encodeWavPcm16,
  floatToInt16,
  writeWavHeader,
} from './wavEncoder';

function ascii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(view.getUint8(offset + i));
  }
  return out;
}

describe('wavEncoder', () => {
  it('writeWavHeader escribe una cabecera RIFF/WAVE PCM canónica', () => {
    const view = new DataView(new ArrayBuffer(44));
    writeWavHeader(view, { sampleRate: 44_100, channels: 2, bitsPerSample: 16, dataBytes: 400 });
    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(436);
    expect(ascii(view, 8, 8)).toBe('WAVEfmt ');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44_100);
    expect(view.getUint32(28, true)).toBe(176_400);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(400);
  });

  it('floatToInt16 recorta fuera de rango sin desbordar', () => {
    expect(floatToInt16(2)).toBe(32_767);
    expect(floatToInt16(-2)).toBe(-32_768);
    expect(floatToInt16(0)).toBe(0);
    expect(floatToInt16(0.5)).toBe(16_384);
  });

  it('encodeWavPcm16 estéreo intercala canales y calcula el tamaño exacto', async () => {
    const left = new Float32Array([0, 0.5, 1.5]);
    const right = new Float32Array([-1, -0.5, -1.5]);
    const buffer = await encodeWavPcm16([left, right], 44_100, 2);
    expect(buffer.byteLength).toBe(44 + 3 * 2 * 2);
    const view = new DataView(buffer);
    expect(view.getUint32(40, true)).toBe(12);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(-32_768);
    expect(view.getInt16(48, true)).toBe(16_384);
    expect(view.getInt16(52, true)).toBe(32_767);
    expect(view.getInt16(54, true)).toBe(-32_768);
  });

  it('encodeWavPcm16 mono mezcla por promedio', async () => {
    const buffer = await encodeWavPcm16(
      [new Float32Array([1, 0]), new Float32Array([0, 0])],
      44_100,
      1,
    );
    const view = new DataView(buffer);
    expect(view.getUint16(22, true)).toBe(1);
    expect(buffer.byteLength).toBe(44 + 4);
    expect(view.getInt16(44, true)).toBe(16_384);
    expect(view.getInt16(46, true)).toBe(0);
  });

  it('cede el hilo entre bloques cuando se agota el presupuesto de tiempo', async () => {
    const yieldToMain = vi.fn(async () => {});
    let t = 0;
    const buffer = await encodeWavPcm16([new Float32Array(100)], 44_100, 1, {
      blockFrames: 10,
      sliceBudgetMs: 5,
      yieldToMain,
      now: () => (t += 6),
    });
    expect(buffer.byteLength).toBe(44 + 200);
    expect(yieldToMain).toHaveBeenCalledTimes(9);
  });

  it('choosePcmLayout usa estéreo en pistas cortas y mono si superan el límite', () => {
    expect(choosePcmLayout(180, 2)).toEqual({
      channels: 2,
      sampleRate: PLAYBACK_SAMPLE_RATE,
      downmixed: false,
    });
    expect(choosePcmLayout(600, 2).channels).toBe(1);
    expect(choosePcmLayout(600, 2).downmixed).toBe(true);
    expect(choosePcmLayout(600, 1)).toEqual({
      channels: 1,
      sampleRate: PLAYBACK_SAMPLE_RATE,
      downmixed: false,
    });
  });
});
