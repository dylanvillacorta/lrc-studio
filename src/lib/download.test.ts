import { describe, expect, it } from 'vitest';
import { sanitizeFileName } from '@/lib/download';

describe('sanitizeFileName', () => {
  it('reemplaza caracteres prohibidos en Windows', () => {
    expect(sanitizeFileName('Artista: <Canción> / "Demo" | ?*\\')).toBe(
      'Artista_ _Canción_ _ _Demo_ _ ___',
    );
  });

  it('colapsa espacios múltiples y recorta extremos', () => {
    expect(sanitizeFileName('   Mi   Canción   Final.lrc   ')).toBe(
      'Mi Canción Final.lrc',
    );
  });

  it('devuelve un nombre por defecto cuando la entrada queda vacía', () => {
    expect(sanitizeFileName('')).toBe('archivo');
    expect(sanitizeFileName('   ...   ')).toBe('archivo');
  });

  it('limita la longitud máxima a 120 caracteres', () => {
    const longName = `${'a'.repeat(150)}.lrc`;
    const result = sanitizeFileName(longName);
    expect(result.length).toBe(120);
  });
});
