import { describe, expect, it } from 'vitest';
import {
  assessAudioHealth,
  flagForPageShow,
  flagForStalled,
  shouldRepairAudio,
  shouldTriggerFrozen,
  type AudioHealthInput,
} from '@/features/sync/hooks/audioHealth';

const healthy: AudioHealthInput = {
  expectedSrc: 'blob:a',
  currentSrc: 'blob:a',
  expectedProjectId: 'p1',
  elementProjectId: 'p1',
  readyState: 4,
  networkState: 1,
  hasError: false,
  flag: null,
};

describe('assessAudioHealth (T26)', () => {
  it('elemento con src vigente, metadatos y sin marcas está sano', () => {
    expect(assessAudioHealth(healthy)).toEqual({ healthy: true, reason: null });
  });

  it('sin metadatos pero cargando o en reposo sigue sano (carga posible)', () => {
    expect(assessAudioHealth({ ...healthy, readyState: 0, networkState: 1 }).healthy).toBe(true);
    expect(assessAudioHealth({ ...healthy, readyState: 0, networkState: 2 }).healthy).toBe(true);
  });

  it('sin fuente de red o vacío y sin datos no está sano', () => {
    expect(assessAudioHealth({ ...healthy, readyState: 0, networkState: 3 }).reason).toBe('network-empty');
    expect(assessAudioHealth({ ...healthy, readyState: 0, networkState: 0 }).reason).toBe('network-empty');
  });

  it('detecta src distinto, otro proyecto, error y marcas', () => {
    expect(assessAudioHealth({ ...healthy, currentSrc: 'blob:old' }).reason).toBe('src-mismatch');
    expect(assessAudioHealth({ ...healthy, elementProjectId: 'p2' }).reason).toBe('project-mismatch');
    expect(assessAudioHealth({ ...healthy, hasError: true }).reason).toBe('error');
    expect(assessAudioHealth({ ...healthy, flag: 'emptied' }).reason).toBe('emptied');
    expect(assessAudioHealth({ ...healthy, flag: 'stalled' }).reason).toBe('stalled');
    expect(assessAudioHealth({ ...healthy, flag: 'invalid-url' }).reason).toBe('invalid-url');
    expect(assessAudioHealth({ ...healthy, flag: 'bfcache' }).reason).toBe('bfcache');
  });

  it('sin proyecto conocido en el elemento no se considera otro proyecto', () => {
    expect(assessAudioHealth({ ...healthy, elementProjectId: null }).healthy).toBe(true);
  });

  it('sin fuente vigente no hay nada que reparar', () => {
    const health = assessAudioHealth({ ...healthy, expectedSrc: null });
    expect(health.reason).toBe('no-source');
    expect(shouldRepairAudio(health, { repairing: false, canRepair: true })).toBe(false);
  });
});

describe('shouldRepairAudio y marcas de eventos (T26)', () => {
  const bad = { healthy: false, reason: 'error' as const };

  it('repara solo si no está sano, puede reparar y no hay reparación en curso', () => {
    expect(shouldRepairAudio(bad, { repairing: false, canRepair: true })).toBe(true);
    expect(shouldRepairAudio(bad, { repairing: true, canRepair: true })).toBe(false);
    expect(shouldRepairAudio(bad, { repairing: false, canRepair: false })).toBe(false);
    expect(shouldRepairAudio({ healthy: true, reason: null }, { repairing: false, canRepair: true })).toBe(false);
  });

  it('pageshow marca bfcache solo si persisted', () => {
    expect(flagForPageShow(true)).toBe('bfcache');
    expect(flagForPageShow(false)).toBeNull();
  });

  it('stalled marca solo si faltan datos para reproducir', () => {
    expect(flagForStalled(0)).toBe('stalled');
    expect(flagForStalled(1)).toBe('stalled');
    expect(flagForStalled(3)).toBeNull();
  });

  it('stalled durante un seek o con un blob local no marca', () => {
    expect(flagForStalled(0, { seeking: true })).toBeNull();
    expect(flagForStalled(0, { isBlob: true })).toBeNull();
    expect(flagForStalled(0, { seeking: false, isBlob: false })).toBe('stalled');
  });

  it('frozen exige dos veredictos consecutivos', () => {
    expect(shouldTriggerFrozen(0)).toBe(false);
    expect(shouldTriggerFrozen(1)).toBe(false);
    expect(shouldTriggerFrozen(2)).toBe(true);
    expect(shouldTriggerFrozen(3)).toBe(true);
  });
});
