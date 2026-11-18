export {
  DEFAULT_LOUPE_MARGIN_MS,
  DEFAULT_MIN_WINDOW_MS,
  INSPECTOR_STEPS_MS,
  MIN_LINE_DURATION_MS,
  applyInspectorDelta,
  clampMs,
  computeDraggedEdge,
  computeZoomWindow,
  msToX,
  normalizeLineBounds,
  nudgeLoupeLine,
  snapMs,
  xToMs,
  type DragEdgeParams,
  type LineBounds,
  type ZoomWindow,
  type ZoomWindowOptions,
} from '@/features/loupe/model/loupeModel';

export {
  useDragHandle,
  type DragHandleHandlers,
  type UseDragHandleOptions,
  type UseDragHandleReturn,
} from '@/features/loupe/hooks/useDragHandle';

export {
  InspectorPanel,
  type InspectorPanelProps,
} from '@/features/loupe/components/InspectorPanel';
export {
  LoupeScreen,
  type LoupeScreenProps,
} from '@/features/loupe/components/LoupeScreen';
export {
  LoupeView,
  type LoupeViewProps,
} from '@/features/loupe/components/LoupeView';
export {
  WaveformOverview,
  type WaveformOverviewProps,
} from '@/features/loupe/components/WaveformOverview';
