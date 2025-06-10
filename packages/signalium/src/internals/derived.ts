import WeakRef from '../weakref.js';
import { Tracer, TRACER, TracerMeta } from '../trace.js';
import { ReactiveValue, Signal, SignalEquals, SignalListener, SignalOptionsWithInit } from '../types.js';
import { getUnknownSignalFnName } from './utils/debug-name.js';
import { SignalScope } from './contexts.js';
import { getSignal } from './get.js';
import { Edge } from './edge.js';
import { schedulePull, scheduleUnwatch } from './scheduling.js';
import { hashValue } from './utils/hash.js';
import { stringifyValue } from './utils/stringify.js';

/**
 * This file contains computed signal base types and struct definitions.
 *
 * Computed signals are monomorphic to make them more efficient, but this also
 * means that multiple fields differ based on the type of the signal. Defining
 * them using this pattern rather than a class allows us to switch on the `type`
 * field to get strong typing in branches everywhere else.
 *
 * "Methods" for this struct are defined in other files for better organization.
 */

export type SignalId = number;

export const enum SignalState {
  Clean = 0,
  Pending = 1,
  Dirty = 2,
  MaybeDirty = 3,
}

export const enum SignalFlags {
  // State
  State = 0b11,

  // Properties
  isSubscription = 0b100,
  isListener = 0b1000,
}

let ID = 0;

interface ListenerMeta {
  updatedAt: number;
  current: Set<SignalListener>;

  // Cached bound add method to avoid creating a new one on each call, this is
  // specifically for React hooks where useSyncExternalStore will resubscribe each
  // time if the method is not cached. This prevents us from having to add a
  // useCallback for the listener.
  cachedBoundAdd: (listener: SignalListener) => () => void;
}

/**
 * Shared definition for derived signals to reduce memory usage.
 * Contains configuration that's common across all instances of a reactive function.
 */
export interface DerivedSignalDefinition<T, Args extends unknown[]> {
  compute: (...args: Args) => T;
  equals: SignalEquals<T>;
  shouldGC?: (signal: object, value: T, args: Args) => boolean;
  isSubscription: boolean;
}

export class DerivedSignal<T, Args extends unknown[]> implements Signal<ReactiveValue<T>> {
  // Bitmask containing state in the first 2 bits and boolean properties in the remaining bits
  private flags: number;
  scope: SignalScope | undefined = undefined;

  subs = new Map<WeakRef<DerivedSignal<any, any>>, Edge>();
  deps = new Map<DerivedSignal<any, any>, Edge>();

  ref: WeakRef<DerivedSignal<T, Args>> = new WeakRef(this);

  dirtyHead: Edge | undefined = undefined;

  updatedCount: number = 0;
  computedCount: number = 0;

  watchCount: number = 0;

  _listeners: ListenerMeta | null = null;

  key: SignalId | undefined;
  args: Args;
  value: ReactiveValue<T> | undefined;

  tracerMeta?: TracerMeta;

  // Reference to the shared definition
  def: DerivedSignalDefinition<T, Args>;

  constructor(
    definition: DerivedSignalDefinition<T, Args>,
    args: Args,
    key?: SignalId,
    scope?: SignalScope,
    opts?: Partial<SignalOptionsWithInit<T, Args>> & { tracer?: Tracer },
  ) {
    this.flags = (definition.isSubscription ? SignalFlags.isSubscription : 0) | SignalState.Dirty;
    this.scope = scope;
    this.key = key;
    this.args = args;
    this.def = definition;
    this.value = opts?.initValue as ReactiveValue<T>;

    if (TRACER) {
      this.tracerMeta = {
        id: opts?.id ?? key ?? hashValue([definition.compute, ID++]),
        desc: opts?.desc ?? definition.compute.name ?? getUnknownSignalFnName(definition.compute),
        params: args.map(arg => stringifyValue(arg)).join(', '),
        tracer: opts?.tracer,
      };
    }
  }

  get _state() {
    return this.flags & SignalFlags.State;
  }

  set _state(state: SignalState) {
    this.flags = (this.flags & ~SignalFlags.State) | state;
  }

  get _isListener() {
    return (this.flags & SignalFlags.isListener) !== 0;
  }

  set _isListener(isListener: boolean) {
    if (isListener) {
      this.flags |= SignalFlags.isListener;
    } else {
      this.flags &= ~SignalFlags.isListener;
    }
  }

  get listeners() {
    return (
      this._listeners ??
      (this._listeners = {
        updatedAt: 0,
        current: new Set(),
        cachedBoundAdd: this.addListener.bind(this),
      })
    );
  }

  get(): ReactiveValue<T> {
    return getSignal(this);
  }

  addListener(listener: SignalListener) {
    const { current } = this.listeners;

    if (!current.has(listener)) {
      if (!this._isListener) {
        this.watchCount++;
        this.flags |= SignalFlags.isListener;
      }

      schedulePull(this);

      current.add(listener);
    }

    return () => {
      if (current.has(listener)) {
        current.delete(listener);

        if (current.size === 0) {
          scheduleUnwatch(this);
          this.flags &= ~SignalFlags.isListener;
        }
      }
    };
  }

  // This method is used in React hooks specifically. It returns a bound add method
  // that is cached to avoid creating a new one on each call, and it eagerly sets
  // the listener as watched so that subscriptions that are accessed will be activated.
  addListenerLazy() {
    if (!this._isListener) {
      this.watchCount++;
      this.flags |= SignalFlags.isListener;
    }

    return this.listeners.cachedBoundAdd;
  }
}

export const runListeners = (signal: DerivedSignal<any, any>) => {
  const { listeners } = signal;

  if (listeners === null) {
    return;
  }

  const { current } = listeners;

  for (const listener of current) {
    listener();
  }
};

export const isSubscription = (signal: unknown): boolean => {
  return ((signal as any).flags & SignalFlags.isSubscription) !== 0;
};

export function createDerivedSignal<T, Args extends unknown[]>(
  def: DerivedSignalDefinition<T, Args>,
  args: Args = [] as any,
  key?: SignalId,
  scope?: SignalScope,
  opts?: Partial<SignalOptionsWithInit<T, Args>> & { tracer?: Tracer },
): DerivedSignal<T, Args> {
  return new DerivedSignal(def, args, key, scope, opts);
}
