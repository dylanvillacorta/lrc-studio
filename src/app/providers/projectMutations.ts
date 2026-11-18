import { durationSecToMs } from '@/features/session';
import { computeSyncProgress } from '@/features/sync';
import type { LyricLine, ProjectFullData } from '@/types';

/**
 * Aplica nuevas líneas al proyecto activo y recalcula métricas de progreso y `updatedAt`.
 */
export function applyLinesToProject(
  project: ProjectFullData,
  nextLines: LyricLine[],
  nowMs = Date.now(),
): ProjectFullData {
  const progress = computeSyncProgress(nextLines);
  return {
    ...project,
    lines: nextLines,
    ...progress,
    updatedAt: nowMs,
  };
}

/**
 * Actualiza los metadatos acústicos del proyecto al adjuntar un audio (`durationSec` en segundos -> `durationMs` en ms).
 */
export function applyAttachedAudioToProject(
  project: ProjectFullData,
  fileName: string,
  peaks: number[],
  durationSec: number,
  nowMs = Date.now(),
): ProjectFullData {
  return {
    ...project,
    audioFileName: fileName,
    durationMs: durationSecToMs(durationSec),
    waveformPeaks: peaks,
    updatedAt: nowMs,
  };
}

/**
 * Aplica un parche parcial de título, artista o ajustes al proyecto activo.
 */
export function applyMetadataToProject(
  project: ProjectFullData,
  patch: Partial<Pick<ProjectFullData, 'title' | 'artist' | 'settings'>>,
  nowMs = Date.now(),
): ProjectFullData {
  return {
    ...project,
    ...patch,
    settings: patch.settings ? { ...patch.settings } : project.settings,
    updatedAt: nowMs,
  };
}
