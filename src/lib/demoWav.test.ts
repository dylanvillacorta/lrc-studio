import { describe, expect, it } from 'vitest';
import { createSynthesizedDemoWav } from '@/lib/demoWav';

describe('createSynthesizedDemoWav', () => {
  it('genera un encabezado RIFF/WAVE válido y duración en milisegundos', () => {
    const demo = createSynthesizedDemoWav(2);
    const bytes = new Uint8Array(demo.buffer);

    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
    expect(demo.durationMs).toBe(2000);
    expect(demo.blob.type).toBe('audio/wav');
    expect(demo.peaks.length).toBeGreaterThan(0);
    demo.peaks.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });

    if (demo.url && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(demo.url);
    }
  });
});
