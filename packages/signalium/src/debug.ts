export {
  setTracing,
  createTracer,
  createTracerFromId,
  removeTracer,
  VisualizerNode,
  type VisualizerLink,
  TracerEventType,
  type Tracer,
  TRACER,
  SignalType,
  // New OpenTelemetry direct API
  createTraceId,
  startSignalUpdate,
  endSignalUpdate,
  startSignalLoading,
  endSignalLoading,
  recordSignalConnection,
  recordSignalDisconnection,
  recordStateConsumption,
  buildVisualizerTree,
  // Export OpenTelemetry utilities for advanced use cases
  memoryExporter,
  otelTracer,
  provider,
  getMemoryExporter,
  getOtelTracer,
  getProvider,
} from './trace.js';

export { scheduleTracer } from './internals/scheduling.js';
