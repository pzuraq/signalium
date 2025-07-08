import { scheduleTracer } from './internals/scheduling.js';
import { DerivedSignal, SignalId } from './internals/derived.js';
import { Signal } from './types.js';
import { trace, Span, Tracer as OTelTracer, SpanKind, SpanStatusCode, context } from '@opentelemetry/api';
import { InMemorySpanExporter, BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';

let OTEL_TRACER: OTelTracer | null = null;
let memoryExporter: InMemorySpanExporter | null = null;
let spanProcessor: SimpleSpanProcessor | null = null;
let provider: WebTracerProvider | null = null;

export let TRACING_ENABLED = false;

// Legacy global tracer for backwards compatibility
export let TRACER: { emit: (event: any) => void } | undefined;

// Map from signal ID to trace ID for legacy compatibility
const signalToTraceMap = new Map<string | number, string>();

// Map from tracer ID to trace ID
const tracerToTraceMap = new Map<string | number, string>();

// Track signal relationships and metadata for enhanced span attributes
const signalMetadata = new Map<
  string | number,
  {
    parentId?: string | number;
    name?: string;
    params?: string;
    type?: string;
    depth?: number;
  }
>();

export interface VisualizerLink {
  connected: boolean;
  version: number;
  node: VisualizerNode;
}

export interface TracerMeta {
  id: string | number;
  desc: string;
  params: string;
  traceId?: string;
}

export enum TracerEventType {
  StartUpdate = 'StartUpdate',
  EndUpdate = 'EndUpdate',
  StartLoading = 'StartLoading',
  EndLoading = 'EndLoading',

  Connected = 'Connected',
  Disconnected = 'Disconnected',

  ConsumeState = 'ConsumeState',
}

export enum SignalType {
  State = 'state',
  Reactive = 'reactive',
  Watcher = 'watcher',
}

export class VisualizerNode {
  private subscribers: (() => void)[] = [];
  private nextStateChildren: VisualizerNode[] = [];

  public stateChildren: VisualizerNode[] = [];
  public children: VisualizerLink[] = [];
  public updating = true;
  public loading = false;
  public version = 0;

  private updatingVersion = 0;
  private didConnect = false;

  constructor(
    public depth: number,
    public type: SignalType,
    public id: string | number,
    public value: unknown,
    public name?: string,
    public params?: string,
    private _setValue?: (value: unknown) => void,
    public showParams = true,
    public showValue = true,
    public interactive = true,
  ) {}

  setValue(value: unknown) {
    if (this.type !== SignalType.State) {
      throw new Error('setValue is only allowed on state nodes');
    }

    this._setValue?.(value);
    this.notify();
  }

  connectChild(child: VisualizerNode): boolean {
    let childLink = this.children.find(
      link => link.node.id === child.id || (link.node.name === child.name && link.version !== this.updatingVersion),
    );

    let shouldSkip = false;

    if (childLink) {
      if (!child.didConnect) {
        child.value = childLink.node.value;
        child.children = childLink.node.children.map(link => ({
          ...link,
          version: child.version,
        }));
      }

      childLink.node = child;
      childLink.connected = true;
      childLink.version = this.updatingVersion;
      shouldSkip = true;
    } else {
      this.children.push({
        connected: true,
        node: child,
        version: this.updatingVersion,
      });
    }

    child.didConnect = true;
    this.notify();

    return shouldSkip;
  }

  disconnectChild(childId: string | number) {
    const childLink = this.children.find(link => link.node.id === childId);

    if (!childLink) {
      return;
    }

    childLink.connected = false;
    this.notify();
  }

  startUpdate() {
    this.updating = true;
    this.updatingVersion++;
    this.notify();
  }

  endUpdate(value: unknown, preserveChildren = false) {
    this.updating = false;
    this.value = value;
    if (!preserveChildren) {
      this.stateChildren = this.nextStateChildren;
    }
    this.nextStateChildren = [];
    this.notify();
  }

  startLoading() {
    this.loading = true;
    this.notify();
  }

  endLoading(value: unknown) {
    this.loading = false;
    this.value = value;
    this.notify();
  }

  consumeState(id: string | number, value: unknown, setValue: (value: unknown) => void) {
    const existing = this.stateChildren.find(child => child.id === id);

    if (existing) {
      existing.value = value;
      this.nextStateChildren.push(existing);
      existing.notify();
    } else {
      const node = new VisualizerNode(
        this.depth + 1,
        SignalType.State,
        id,
        value,
        undefined,
        undefined,
        setValue,
        this.showParams,
        this.showValue,
        this.interactive,
      );
      node.updating = false;
      this.nextStateChildren.push(node);
    }
  }

  notify() {
    this.version++;
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }

  subscribe(subscriber: () => void) {
    this.subscribers.push(subscriber);

    return () => {
      this.subscribers = this.subscribers.filter(s => s !== subscriber);
    };
  }
}

// Active spans by trace ID and signal ID
const activeSpans = new Map<string, Map<string | number, Span>>();

// Helper to create a span
function createSignalSpan(
  traceId: string,
  signalId: string | number,
  operation: string,
  name?: string,
  signalType?: string,
) {
  if (!TRACING_ENABLED || !OTEL_TRACER) return;

  // Get metadata for this signal
  const metadata = signalMetadata.get(signalId) || {};

  const spanName = name || metadata.name || `signal-${signalId}`;
  const attributes: Record<string, string | number | boolean> = {
    'signal.id': String(signalId),
    'signal.type': signalType || metadata.type || 'unknown',
    'signal.operation': operation,
    'trace.id': traceId,
  };

  // Add metadata as span attributes
  if (metadata.parentId !== undefined) {
    attributes['signal.parent_id'] = String(metadata.parentId);
  }
  if (metadata.name) {
    attributes['signal.name'] = metadata.name;
  }
  if (metadata.params) {
    attributes['signal.params'] = metadata.params;
  }
  if (metadata.depth !== undefined) {
    attributes['signal.depth'] = metadata.depth;
  }

  const span = OTEL_TRACER.startSpan(spanName, {
    kind: SpanKind.INTERNAL,
    attributes,
  });

  // Store the span
  if (!activeSpans.has(traceId)) {
    activeSpans.set(traceId, new Map());
  }
  const traceSpans = activeSpans.get(traceId)!;
  traceSpans.set(`${signalId}-${operation}`, span);

  return span;
}

// Helper to end a span
function endSignalSpan(
  traceId: string,
  signalId: string | number,
  operation: string,
  value?: unknown,
  preserveChildren?: boolean,
) {
  if (!TRACING_ENABLED) return;

  const traceSpans = activeSpans.get(traceId);
  if (!traceSpans) return;

  const span = traceSpans.get(`${signalId}-${operation}`);
  if (!span) return;

  if (value !== undefined) {
    // Handle JSX and other complex values properly for display
    let displayValue: string;
    if (typeof value === 'object' && value !== null) {
      // Check if it's a React element
      if ('type' in value && 'props' in value) {
        const element = value as { type: any; props: any };
        // It's likely a JSX element - extract meaningful text
        if (typeof element.props.children === 'string') {
          displayValue = element.props.children;
        } else if (Array.isArray(element.props.children)) {
          displayValue = element.props.children.filter((child: any) => typeof child === 'string').join(' ');
        } else {
          displayValue = `<${String(element.type)}>`;
        }
      } else {
        displayValue = JSON.stringify(value);
      }
    } else {
      displayValue = String(value);
    }

    span.setAttributes({
      'signal.value': displayValue,
    });
  }

  if (preserveChildren !== undefined) {
    span.setAttributes({
      'signal.preserveChildren': Boolean(preserveChildren),
    });
  }

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
  traceSpans.delete(`${signalId}-${operation}`);
}

// Helper to add events to active spans
function addSpanEvent(
  traceId: string,
  signalId: string | number,
  eventName: string,
  attributes?: Record<string, string | number | boolean>,
) {
  if (!TRACING_ENABLED) return;

  const traceSpans = activeSpans.get(traceId);
  if (!traceSpans) return;

  // Add event to any active spans for this signal
  for (const [key, span] of traceSpans) {
    if (String(key).startsWith(`${signalId}-`)) {
      span.addEvent(eventName, attributes);
    }
  }
}

// Public API functions
export function setTracing(enabled: boolean) {
  TRACING_ENABLED = enabled;

  if (enabled) {
    // Initialize OpenTelemetry
    memoryExporter = new InMemorySpanExporter();
    // Use SimpleSpanProcessor for immediate export in debug mode
    spanProcessor = new SimpleSpanProcessor(memoryExporter);
    provider = new WebTracerProvider({
      spanProcessors: [spanProcessor],
      sampler: new AlwaysOnSampler(), // 100% sampling for debugging/visualization
    });
    provider.register();

    OTEL_TRACER = trace.getTracer('signalium');
    // Create a legacy TRACER that converts events to the new span-based API
    TRACER = {
      emit: (event: any) => {
        // Convert legacy events to new span calls
        if (!event.id) return;

        // Find the trace ID for this signal, or use a default
        let traceId = signalToTraceMap.get(event.id);
        if (!traceId) {
          // If we don't have a trace ID for this signal yet, it might be connecting to a parent
          if (event.type === TracerEventType.Connected && tracerToTraceMap.has(event.id)) {
            traceId = tracerToTraceMap.get(event.id)!;
            // Map the child signal to the same trace
            signalToTraceMap.set(event.childId, traceId);
          } else {
            // Create a new trace for orphaned signals
            traceId = createTraceId(`signal-${event.id}`);
            signalToTraceMap.set(event.id, traceId);
          }
        }

        switch (event.type) {
          case TracerEventType.StartUpdate: {
            // Capture signal metadata
            if (!signalMetadata.has(event.id)) {
              signalMetadata.set(event.id, {});
            }
            const metadata = signalMetadata.get(event.id)!;
            if (event.name) metadata.name = event.name;
            if (event.nodeType) metadata.type = event.nodeType;

            startSignalUpdate(traceId, event.id, event.name, event.nodeType);
            break;
          }
          case TracerEventType.EndUpdate:
            endSignalUpdate(traceId, event.id, event.value, event.preserveChildren);
            break;
          case TracerEventType.StartLoading:
            startSignalLoading(traceId, event.id, event.name, event.nodeType);
            break;
          case TracerEventType.EndLoading:
            endSignalLoading(traceId, event.id, event.value);
            break;
          case TracerEventType.Connected: {
            // Make sure child signal uses the same trace ID
            signalToTraceMap.set(event.childId, traceId);

            // Capture parent-child relationship and depth
            if (!signalMetadata.has(event.childId)) {
              signalMetadata.set(event.childId, {});
            }
            const childMetadata = signalMetadata.get(event.childId)!;
            childMetadata.parentId = event.id;
            if (event.name) childMetadata.name = event.name;
            if (event.params) childMetadata.params = event.params;
            if (event.nodeType) childMetadata.type = event.nodeType;

            // Calculate depth
            const parentMetadata = signalMetadata.get(event.id);
            const parentDepth = parentMetadata?.depth ?? 0;
            childMetadata.depth = parentDepth + 1;

            recordSignalConnection(traceId, event.id, event.childId, event.nodeType, event.name, event.params);
            break;
          }
          case TracerEventType.Disconnected:
            recordSignalDisconnection(traceId, event.id, event.childId);
            break;
          case TracerEventType.ConsumeState: {
            // Make sure state signal uses the same trace ID
            signalToTraceMap.set(event.childId, traceId);

            // Mark the consumed signal as state type
            if (!signalMetadata.has(event.childId)) {
              signalMetadata.set(event.childId, {});
            }
            const stateMetadata = signalMetadata.get(event.childId)!;
            stateMetadata.type = 'state';
            stateMetadata.parentId = event.id;
            stateMetadata.name = `count${event.childId}`;

            // Calculate depth
            const consumerMetadata = signalMetadata.get(event.id);
            const consumerDepth = consumerMetadata?.depth ?? 0;
            stateMetadata.depth = consumerDepth + 1;

            recordStateConsumption(traceId, event.id, event.childId, event.value);
            break;
          }
        }
      },
    };
  } else {
    TRACER = undefined;
  }
}

export function createTraceId(name?: string): string {
  if (!TRACING_ENABLED) {
    throw new Error('Tracing is not enabled');
  }
  return `${name || 'trace'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Signal operation functions
export function startSignalUpdate(traceId: string, signalId: string | number, name?: string, signalType?: string) {
  createSignalSpan(traceId, signalId, 'update', name, signalType);
}

export function endSignalUpdate(
  traceId: string,
  signalId: string | number,
  value: unknown,
  preserveChildren?: boolean,
) {
  endSignalSpan(traceId, signalId, 'update', value, preserveChildren);
}

export function startSignalLoading(traceId: string, signalId: string | number, name?: string, signalType?: string) {
  createSignalSpan(traceId, signalId, 'loading', name ? `${name}-loading` : undefined, signalType);
}

export function endSignalLoading(traceId: string, signalId: string | number, value: unknown) {
  endSignalSpan(traceId, signalId, 'loading', value);
}

export function recordSignalConnection(
  traceId: string,
  parentId: string | number,
  childId: string | number,
  nodeType: string,
  name?: string,
  params?: string,
) {
  addSpanEvent(traceId, parentId, 'child_connected', {
    'child.id': String(childId),
    'child.type': nodeType,
    'child.name': name || 'unknown',
    'child.params': params || '',
  });
}

export function recordSignalDisconnection(traceId: string, parentId: string | number, childId: string | number) {
  addSpanEvent(traceId, parentId, 'child_disconnected', {
    'child.id': String(childId),
  });
}

export function recordStateConsumption(
  traceId: string,
  signalId: string | number,
  stateId: string | number,
  value: unknown,
) {
  addSpanEvent(traceId, signalId, 'state_consumed', {
    'state.id': String(stateId),
    'state.value': String(value),
  });
}

// Visualization functions - reconstruct VisualizerNode tree from spans
export function buildVisualizerTree(
  traceId: string,
  showParams = true,
  showValue = true,
  interactive = true,
): VisualizerNode | null {
  if (!memoryExporter) return null;

  const spans = memoryExporter.getFinishedSpans().filter(span => span.attributes['trace.id'] === traceId);

  if (spans.length === 0) return null;

  // Group spans by signal ID and get the latest update span for each signal
  const signalSpans = new Map<string, any>();
  spans.forEach(span => {
    const signalId = span.attributes['signal.id'] as string;
    const operation = span.attributes['signal.operation'] as string;

    // Only use update spans for tree building (not loading spans)
    if (operation === 'update') {
      if (!signalSpans.has(signalId) || span.endTime > signalSpans.get(signalId).endTime) {
        signalSpans.set(signalId, span);
      }
    }
  });

  // Create nodes from spans, determining types from events
  const nodeMap = new Map<string | number, VisualizerNode>();
  const parentChildMap = new Map<string, string[]>(); // parent -> children
  const stateConsumptions = new Map<string, Array<{ stateId: string; value: any }>>(); // parent -> state consumptions
  let rootNode: VisualizerNode | null = null;

  // First pass: analyze ALL spans to capture ALL events
  spans.forEach(span => {
    const signalId = span.attributes['signal.id'] as string;
    const operation = span.attributes['signal.operation'] as string;

    // Only process update operations
    if (operation !== 'update') return;

    span.events.forEach((event: any) => {
      if (event.name === 'child_connected') {
        const childId = event.attributes?.['child.id'] as string;
        if (!parentChildMap.has(signalId)) {
          parentChildMap.set(signalId, []);
        }
        // Avoid duplicates
        if (!parentChildMap.get(signalId)!.includes(childId)) {
          parentChildMap.get(signalId)!.push(childId);
        }
      } else if (event.name === 'state_consumed') {
        const stateId = event.attributes?.['state.id'] as string;
        const stateValue = event.attributes?.['state.value'];
        if (!stateConsumptions.has(signalId)) {
          stateConsumptions.set(signalId, []);
        }
        // Store latest value for each state
        const existing = stateConsumptions.get(signalId)!.find(s => s.stateId === stateId);
        if (existing) {
          existing.value = stateValue;
        } else {
          stateConsumptions.get(signalId)!.push({ stateId, value: stateValue });
        }
      }
    });
  });

  // Second pass: create nodes using enhanced span attributes
  signalSpans.forEach(span => {
    const signalId = span.attributes['signal.id'] as string;
    const value = span.attributes['signal.value'] || '';
    const signalType = (span.attributes['signal.type'] as string) || 'reactive';
    const depth = Number(span.attributes['signal.depth']) || 0;
    const name = (span.attributes['signal.name'] as string) || span.name.replace('signal-', '');

    const node = new VisualizerNode(
      depth,
      signalType as SignalType,
      signalId,
      value,
      name,
      '', // params
      undefined, // setValue
      showParams,
      showValue,
      interactive,
    );

    node.updating = false;
    node.loading = false;

    nodeMap.set(signalId, node);

    // Root node is the one with depth 0 (should be the watcher)
    if (depth === 0) {
      rootNode = node;
    }
  });

  // Third pass: build relationships
  parentChildMap.forEach((childIds, parentId) => {
    const parentNode = nodeMap.get(parentId);
    if (!parentNode) return;

    childIds.forEach(childId => {
      const childNode = nodeMap.get(childId);
      if (childNode) {
        parentNode.connectChild(childNode);
      }
    });
  });

  // Handle state consumptions
  stateConsumptions.forEach((consumptions, parentId) => {
    const parentNode = nodeMap.get(parentId);
    if (!parentNode) return;

    consumptions.forEach(({ stateId, value }) => {
      // Create state node if it doesn't exist
      if (!nodeMap.has(stateId)) {
        const stateNode = new VisualizerNode(
          parentNode.depth + 1,
          SignalType.State,
          stateId,
          value,
          `count${stateId}`,
          '',
          () => {}, // setState function
          showParams,
          showValue,
          interactive,
        );
        stateNode.updating = false;
        stateNode.loading = false;
        nodeMap.set(stateId, stateNode);
      }

      const stateNode = nodeMap.get(stateId)!;
      stateNode.value = value; // Update with latest value
      parentNode.consumeState(stateId, value, () => {});
    });
  });

  return rootNode;
}

// Helper function to merge tree structures while preserving node identity
function mergeVisualizerNodes(existingNode: VisualizerNode, newNode: VisualizerNode) {
  // Update the existing node's properties with new values
  existingNode.value = newNode.value;
  existingNode.updating = newNode.updating;
  existingNode.loading = newNode.loading;

  // Create maps for quick lookup of existing nodes
  const existingChildrenMap = new Map<string | number, VisualizerNode>();
  const existingStateMap = new Map<string | number, VisualizerNode>();

  existingNode.children.forEach(child => {
    existingChildrenMap.set(child.node.id, child.node);
  });
  existingNode.stateChildren.forEach(state => {
    existingStateMap.set(state.id, state);
  });

  // Process new children - reuse existing nodes where possible
  const newChildren: VisualizerLink[] = [];
  newNode.children.forEach(newChild => {
    const existingChild = existingChildrenMap.get(newChild.node.id);
    if (existingChild) {
      // Reuse existing node but update its properties
      existingChild.value = newChild.node.value;
      existingChild.updating = newChild.node.updating;
      existingChild.loading = newChild.node.loading;

      // Recursively merge children
      mergeVisualizerNodes(existingChild, newChild.node);

      newChildren.push({
        connected: newChild.connected,
        version: newChild.version,
        node: existingChild,
      });
    } else {
      // Add new node as-is
      newChildren.push(newChild);
    }
  });

  // Process new state children - reuse existing nodes where possible
  const newStateChildren: VisualizerNode[] = [];
  newNode.stateChildren.forEach(newState => {
    const existingState = existingStateMap.get(newState.id);
    if (existingState) {
      // Reuse existing state node but update its value
      existingState.value = newState.value;
      existingState.updating = newState.updating;
      existingState.loading = newState.loading;
      newStateChildren.push(existingState);
    } else {
      // Add new state node as-is
      newStateChildren.push(newState);
    }
  });

  // Replace the arrays with the merged results
  existingNode.children = newChildren;
  existingNode.stateChildren = newStateChildren;
}

// Legacy API compatibility for HooksVisualizer
export interface Tracer {
  rootNode: VisualizerNode;
  maxDepth: number;
  showParams: boolean;
  showValue: boolean;
  interactive: boolean;
  addListener: (listener: () => void) => () => void;
  getSpans: () => any[];
  clearSpans: () => void;
  flush: () => void;
}

export function createTracerFromId(id: string | number, immediate = false): Tracer {
  const traceId = createTraceId(String(id));

  // Store the mapping from tracer ID to trace ID
  tracerToTraceMap.set(id, traceId);

  // Also map the tracer ID itself to this trace (since the tracer becomes a signal)
  signalToTraceMap.set(id, traceId);

  // Initialize metadata for the root tracer node
  signalMetadata.set(id, {
    name: String(id),
    type: 'watcher',
    depth: 0,
  });

  // Create a root node for compatibility
  const rootNode = new VisualizerNode(0, SignalType.Watcher, id, '', undefined, undefined, undefined, true, true, true);

  // Map to track signal nodes by ID for building relationships
  const signalNodes = new Map<string | number, VisualizerNode>();

  return {
    rootNode,
    maxDepth: 0,
    showParams: true,
    showValue: true,
    interactive: true,
    addListener: (listener: () => void) => {
      const unsubscribe = rootNode.subscribe(listener);

      // Function to update the tree from spans
      const updateTreeFromSpans = () => {
        const builtTree = buildVisualizerTree(traceId, true, true, true);

        if (builtTree) {
          // Instead of replacing children arrays, merge them to preserve node identity
          mergeVisualizerNodes(rootNode, builtTree);
          rootNode.notify();
        }
      };

      // Update immediately if spans are already available
      updateTreeFromSpans();

      // Also update periodically in case new spans arrive
      const intervalId = setInterval(updateTreeFromSpans, 50);

      return () => {
        clearInterval(intervalId);
        unsubscribe();
      };
    },
    getSpans: () => memoryExporter?.getFinishedSpans().filter(span => span.attributes['trace.id'] === traceId) || [],
    clearSpans: () => {
      if (!memoryExporter) return;

      // Clear spans for this trace only
      const allSpans = memoryExporter.getFinishedSpans();
      memoryExporter.reset();
      // Re-add spans that don't belong to this trace
      allSpans
        .filter(span => span.attributes['trace.id'] !== traceId)
        .forEach(span => {
          // Note: InMemorySpanExporter doesn't support selective removal
          // This is a limitation we'd need to address for full functionality
        });
    },
    flush: () => {
      // Force span processor to flush (no-op for SimpleSpanProcessor)
      spanProcessor?.forceFlush?.();
    },
  };
}

// Backwards compatibility
export function createTracer(_signal: Signal<unknown>, immediate = false) {
  const signal = _signal as unknown as DerivedSignal<unknown, unknown[]>;
  return createTracerFromId(signal.tracerMeta!.id, immediate);
}

export function removeTracer(tracer: Tracer) {
  // Clean up mappings for this tracer
  const tracerId = tracer.rootNode.id;
  const traceId = tracerToTraceMap.get(tracerId);

  if (traceId) {
    // Remove tracer mapping
    tracerToTraceMap.delete(tracerId);

    // Remove signal mappings for this trace
    for (const [signalId, signalTraceId] of signalToTraceMap.entries()) {
      if (signalTraceId === traceId) {
        signalToTraceMap.delete(signalId);
      }
    }
  }
}

// Export OpenTelemetry utilities for advanced use cases
export function getMemoryExporter() {
  return memoryExporter;
}

export function getOtelTracer() {
  return OTEL_TRACER;
}

export function getProvider() {
  return provider;
}

// Legacy exports - these will be null until setTracing(true) is called
export { memoryExporter, provider };
export const otelTracer = OTEL_TRACER;
