# OpenTelemetry Integration

Signalium now uses OpenTelemetry directly for tracing signal operations, replacing the previous custom tracing system with industry-standard observability tools.

## Architecture

The new system eliminates the custom `Tracer` class and instead:

- **Creates OpenTelemetry spans directly** when signal operations occur
- **Uses trace IDs** to group related signal operations
- **Provides a compatibility layer** for existing `HooksVisualizer` code
- **Reconstructs VisualizerNode trees from spans** when needed for visualization

## Features

- **Pure OpenTelemetry**: Direct span creation with standard attributes and events
- **InMemorySpanExporter**: Captures spans for programmatic access and visualization
- **100% Sampling**: All spans are captured (no sampling/dropping) for complete visibility
- **Backwards compatibility**: Existing `HooksVisualizer` code continues to work
- **Simplified API**: No more complex event systems or custom tracer management

## API Changes

### Old System (Removed)
```typescript
// Old custom tracer with events
const tracer = createTracerFromId('my-signal');
tracer.emit({
  type: TracerEventType.StartUpdate,
  id: 'signal-1'
});
```

### New System
```typescript
// Direct OpenTelemetry span operations
import { setTracing, startSignalUpdate, endSignalUpdate } from 'signalium/debug';

setTracing(true);
const traceId = 'my-trace-id';
startSignalUpdate(traceId, 'signal-1', 'mySignal', 'reactive');
endSignalUpdate(traceId, 'signal-1', 'result-value');
```

### Compatibility Layer
```typescript
// This still works for HooksVisualizer compatibility
import { setTracing, createTracerFromId } from 'signalium/debug';

setTracing(true);
const tracer = createTracerFromId('my-signal');
// tracer.rootNode, tracer.addListener, etc. all work as before
```

## Core Functions

### `setTracing(enabled: boolean)`
Enables/disables OpenTelemetry tracing and sets up the legacy compatibility layer.

### Direct Span Operations
- `startSignalUpdate(traceId, signalId, name?, signalType?)`
- `endSignalUpdate(traceId, signalId, value, preserveChildren?)`
- `startSignalLoading(traceId, signalId, name?, signalType?)`
- `endSignalLoading(traceId, signalId, value)`
- `recordSignalConnection(traceId, parentId, childId, nodeType, name?, params?)`
- `recordSignalDisconnection(traceId, parentId, childId)`
- `recordStateConsumption(traceId, signalId, stateId, value)`

### Visualization Functions
- `buildVisualizerTree(traceId, showParams?, showValue?, interactive?)` - Reconstructs VisualizerNode tree from spans
- `createTraceId(name?)` - Creates a unique trace ID

## OpenTelemetry Access

```typescript
import { memoryExporter, otelTracer, provider } from 'signalium/debug';

// Get all captured spans
const spans = memoryExporter.getFinishedSpans();

// Filter spans by trace ID
const traceSpans = spans.filter(span => 
  span.attributes['trace.id'] === 'my-trace-id'
);

// Access the OpenTelemetry tracer directly
const span = otelTracer.startSpan('custom-operation');
span.end();
```

## Sampling Configuration

Signalium is configured with **100% sampling** using `AlwaysOnSampler`:

- ✅ **All spans are captured** - no spans are dropped or sampled out
- ✅ **Complete visibility** - perfect for debugging and visualization
- ✅ **Deterministic behavior** - consistent span collection across runs

This ensures the HooksVisualizer and debugging tools have complete trace data.

## Span Attributes

Signalium spans include these attributes:
- `signal.id` - The signal identifier
- `signal.type` - Type of signal (reactive, state, watcher)
- `signal.operation` - Operation type (update, loading)
- `signal.value` - Signal value (when available)
- `trace.id` - Trace identifier for grouping

## Span Events

Spans may include events for:
- `child_connected` - When a signal connects to a child
- `child_disconnected` - When a signal disconnects from a child  
- `state_consumed` - When a signal consumes state

## Migration Guide

### For Library Users
No changes needed - the `HooksVisualizer` continues to work exactly as before.

### For Advanced Users
If you were directly using the old tracing events:

1. Replace event emissions with direct span operations
2. Use trace IDs instead of tracer instances
3. Filter spans by trace ID for visualization
4. Use `buildVisualizerTree()` to reconstruct node hierarchies

### For Custom Integrations
```typescript
// Before
tracer.emit({ type: TracerEventType.StartUpdate, id: 'signal-1' });

// After  
startSignalUpdate(traceId, 'signal-1', 'signalName', 'reactive');
```

## Benefits

1. **Standard Observability**: Direct OpenTelemetry integration
2. **Better Performance**: No event queue or custom scheduling
3. **Simplified Code**: Eliminated complex event system
4. **Enhanced Debugging**: Standard span timeline and attributes
5. **Future Compatibility**: Easy integration with observability platforms 