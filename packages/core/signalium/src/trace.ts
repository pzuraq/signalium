import { ComputedSignal, Signal, signalTypeToVisualizerType, Watcher } from './signals.js';

export let TRACER: TracerProxy | undefined;

export enum VisualizerNodeType {
  State,
  Computed,
  AsyncComputed,
  Subscription,
  Watcher,
}

export interface VisualizerLink {
  connected: boolean;
  version: number;
  node: VisualizerNode;
}

export enum TracerEventType {
  StartUpdate = 'StartUpdate',
  EndUpdate = 'EndUpdate',

  Connected = 'Connected',
  Disconnected = 'Disconnected',

  ConsumeState = 'ConsumeState',
}

type StartUpdateEvent = {
  type: TracerEventType.StartUpdate;
  id: string;
};

type EndUpdateEvent = {
  type: TracerEventType.EndUpdate;
  id: string;
  value: unknown;
};

type ConnectedEvent = {
  type: TracerEventType.Connected;
  id: string;
  childId: string;
  nodeType: VisualizerNodeType;
  name?: string;
  params?: string;
};

type DisconnectedEvent = {
  type: TracerEventType.Disconnected;
  id: string;
  childId: string;
};

type ConsumeStateEvent = {
  type: TracerEventType.ConsumeState;
  id: string;
  childId: string;
  value: unknown;
};

type TracerEvent = StartUpdateEvent | EndUpdateEvent | ConnectedEvent | DisconnectedEvent | ConsumeStateEvent;

export class VisualizerNode {
  private subscribers: (() => void)[] = [];

  private nextStateChildren: VisualizerNode[] = [];

  public stateChildren: VisualizerNode[] = [];
  public children: VisualizerLink[] = [];
  public updating = true;
  public version = 0;

  private updatingVersion = 0;

  constructor(
    private tracer: Tracer,
    public type: VisualizerNodeType,
    public id: string,
    public value: unknown,
    public name?: string,
    public params?: string,
  ) {}

  get showParams() {
    return this.tracer.showParams;
  }

  get showValue() {
    return this.tracer.showValue;
  }

  connectChild(child: VisualizerNode, isNew: boolean): boolean {
    let childLink = this.children.find(
      link => link.node.id === child.id || (link.node.name === child.name && link.version !== this.updatingVersion),
    );

    let shouldSkip = false;

    if (childLink) {
      if (isNew) {
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

    this.notify();

    return shouldSkip;
  }

  disconnectChild(childId: string) {
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

  endUpdate(value: unknown) {
    this.updating = false;
    this.value = value;
    this.stateChildren = this.nextStateChildren;
    this.nextStateChildren = [];
    this.notify();
  }

  consumeState(id: string, value: unknown) {
    const existing = this.stateChildren.find(child => child.id === id);

    if (existing) {
      existing.value = value;
      this.nextStateChildren.push(existing);
      existing.notify();
    } else {
      const node = new VisualizerNode(this.tracer, VisualizerNodeType.State, id, value);
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

let ID = 0;

class TraceFlush {
  private forceComplete = false;
  public promise: Promise<void>;
  public id = ID++;
  constructor(
    private tracer: Tracer,
    private queue: TracerEvent[],
    previousFlush?: TraceFlush,
  ) {
    this.promise = this.runFlush(tracer, queue, previousFlush);
  }

  complete() {
    this.forceComplete = true;
    return this.promise;
  }

  private async runFlush(tracer: Tracer, queue: TracerEvent[], previousFlush?: TraceFlush) {
    if (previousFlush) {
      await previousFlush.complete();
    }

    console.log('runFlush', queue.length);

    for (let i = 0; i < queue.length; i++) {
      const event = queue[i];
      const nextEvent = queue[i + 1];

      // console.log('handleEvent', this.id, event.type, event.name, event.id);
      const skipDelay = tracer.handleEvent(event, nextEvent);

      if (!this.forceComplete && !skipDelay && tracer.delay > 0 && !document.hidden) {
        await new Promise(resolve => setTimeout(resolve, tracer.delay));
      }
    }
  }
}

export class Tracer {
  private nodeMap = new Map<string, VisualizerNode>();

  delay = 200;

  private initialized = false;

  constructor(
    id: string,
    public showParams = true,
    public showValue = true,
  ) {
    const node = new VisualizerNode(this, VisualizerNodeType.Watcher, id, '');

    this.rootNode = node;
    this.nodeMap.set(id, node);
  }

  public rootNode: VisualizerNode;

  private eventQueue: TracerEvent[] = [];
  private currentFlush: TraceFlush | undefined;

  emit(event: TracerEvent) {
    if (this.initialized) {
      this.eventQueue.push(event);
    } else {
      this.handleEvent(event);
    }
  }

  handleEvent(event: TracerEvent, nextEvent?: TracerEvent) {
    const node = this.nodeMap.get(event.id);

    if (!node) {
      return true;
    }

    let skipDelay = false;

    if (event.type === TracerEventType.Connected) {
      let child = this.nodeMap.get(event.childId);
      let isNew = false;

      if (!child) {
        child = new VisualizerNode(this, event.nodeType, event.childId, '', event.name, event.params);
        this.nodeMap.set(event.childId, child);
        isNew = true;
      }

      skipDelay = node.connectChild(child, isNew);
    } else if (event.type === TracerEventType.Disconnected) {
      node.disconnectChild(event.childId);
    } else if (event.type === TracerEventType.StartUpdate) {
      node.startUpdate();

      if (nextEvent && nextEvent.id === event.id && nextEvent.type === TracerEventType.EndUpdate) {
        skipDelay = true;
      }
    } else if (event.type === TracerEventType.EndUpdate) {
      node.endUpdate(event.value);
    } else if (event.type === TracerEventType.ConsumeState) {
      node.consumeState(event.childId, event.value);
    }

    return skipDelay;
  }

  async flush() {
    console.log('flush', this.eventQueue.length);
    if (this.eventQueue.length === 0) {
      return;
    }

    this.currentFlush = new TraceFlush(this, this.eventQueue, this.currentFlush);
    this.eventQueue = [];
  }

  addListener(listener: () => void) {
    this.initialized = true;
    return this.rootNode.subscribe(listener);
  }
}

class TracerProxy {
  private tracers: Tracer[] = [];

  constructor() {}

  emit(event: TracerEvent) {
    this.tracers.forEach(tracer => tracer.emit(event));
  }

  createTracer(id: string): Tracer {
    const tracer = new Tracer(id);

    this.tracers.push(tracer);

    return tracer;
  }

  removeTracer(tracer: Tracer) {
    this.tracers = this.tracers.filter(t => t !== tracer);
  }

  flush() {
    this.tracers.forEach(tracer => tracer.flush());
  }
}

export function setTracing(enabled: boolean) {
  if (enabled) {
    TRACER = new TracerProxy();
  } else {
    TRACER = undefined;
  }
}

export function createTracer(_signal: Signal<unknown> | Watcher<unknown>) {
  const signal = _signal as ComputedSignal<unknown>;
  return createTracerFromId(signal._opts.id);
}

export function createTracerFromId(id: string) {
  if (!TRACER) {
    throw new Error('Tracing is not enabled');
  }

  return TRACER.createTracer(id);
}

export function removeTracer(tracer: Tracer) {
  if (!TRACER) {
    throw new Error('Tracing is not enabled');
  }

  TRACER.removeTracer(tracer);
}
