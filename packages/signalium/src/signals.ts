import {
  scheduleConnect,
  scheduleDirty,
  scheduleDisconnect,
  scheduleEffect,
  schedulePull,
  scheduleWatcher,
} from './scheduling.js';
import WeakRef from './weakref.js';
import { TRACER as TRACER, TracerEventType, VisualizerNodeType } from './trace.js';
import {
  AsyncResult,
  AsyncSignal,
  AsyncTask,
  Signal,
  SignalAsyncCompute,
  SignalCompute,
  SignalEquals,
  SignalOptions,
  SignalOptionsWithInit,
  SignalSubscribe,
  SignalSubscription,
  Watcher,
  WatcherListenerOptions,
} from './types.js';

let CURRENT_ORD = 0;
let CURRENT_CONSUMER: ComputedSignal<any> | undefined;
let CURRENT_IS_WAITING: boolean = false;

// Should not leave the file so it doesn't become an interop issue
const enum SignalType {
  Computed,
  Subscription,
  Async,
  Watcher,
}

const SUBSCRIPTIONS = new WeakMap<ComputedSignal<any>, SignalSubscription | undefined | void>();
const ACTIVE_ASYNCS = new WeakMap<ComputedSignal<any>, Promise<unknown>>();

const enum SignalState {
  Clean,
  MaybeDirty,
  Dirty,
}

const WAITING = Symbol();

interface Link {
  dep: ComputedSignal<any>;
  sub: WeakRef<ComputedSignal<any>>;
  ord: number;
  version: number;
  consumedAt: number;

  nextDirty: Link | undefined;
}

const FALSE_EQUALS: SignalEquals<unknown> = () => false;

export function signalTypeToVisualizerType(type: SignalType): VisualizerNodeType {
  switch (type) {
    case SignalType.Computed:
      return VisualizerNodeType.Computed;
    case SignalType.Subscription:
      return VisualizerNodeType.Subscription;
    case SignalType.Async:
      return VisualizerNodeType.AsyncComputed;
    case SignalType.Watcher:
      return VisualizerNodeType.Watcher;
  }
}

interface InternalSignalOptions<T> extends SignalOptions<T, unknown[]> {
  equals: SignalEquals<T>;
  id: string;
  subscribers?: ((value: T) => void)[];
}

export class ComputedSignal<T> {
  _type: SignalType;

  _deps = new Map<ComputedSignal<any>, Link>();

  _dirtyDep: Link | undefined = undefined;
  _subs = new Set<Link>();
  _state: SignalState = SignalState.Dirty;
  _version: number = 0;
  _computedCount: number = 0;
  _connectedCount: number = 0;
  _currentValue: T | AsyncResult<T> | undefined;
  _compute: SignalCompute<T> | SignalAsyncCompute<T> | SignalSubscribe<T>;

  _opts: InternalSignalOptions<T>;
  _ref: WeakRef<ComputedSignal<T>> = new WeakRef(this);

  constructor(
    type: SignalType,
    compute: SignalCompute<T> | SignalAsyncCompute<T> | SignalSubscribe<T>,
    opts: InternalSignalOptions<T>,
    initValue?: T,
  ) {
    this._type = type;
    this._compute = compute;
    this._opts = opts;

    this._currentValue =
      type !== SignalType.Async
        ? initValue
        : ({
            result: initValue,
            error: undefined,
            isReady: initValue !== undefined,

            isPending: true,
            isError: false,
            isSuccess: false,
            didResolve: false,

            invalidate: () => {
              this._state = SignalState.Dirty;
              this._dirty();
            },

            await: () => {
              if (CURRENT_CONSUMER === undefined || CURRENT_CONSUMER._type !== SignalType.Async) {
                throw new Error(
                  'Cannot await an async signal outside of an async signal. If you are using an async function, you must use signal.await() for all async signals _before_ the first language-level `await` keyword statement (e.g. it must be synchronous).',
                );
              }

              TRACER?.emit({
                type: TracerEventType.StartLoading,
                id: CURRENT_CONSUMER._opts.id,
              });

              const value = this._currentValue as AsyncResult<T>;

              if (value.isPending) {
                const currentConsumer = CURRENT_CONSUMER;
                ACTIVE_ASYNCS.get(this)?.finally(() => schedulePull(currentConsumer));

                CURRENT_IS_WAITING = true;
                throw WAITING;
              } else if (value.isError) {
                throw value.error;
              }

              return value.result as T;
            },
          } as AsyncResult<T>);
  }

  get(): T | AsyncResult<T> {
    if (CURRENT_CONSUMER !== undefined) {
      const { _deps: deps, _computedCount: computedCount, _connectedCount: connectedCount } = CURRENT_CONSUMER;
      const prevLink = deps.get(this);

      if (prevLink === undefined) {
        TRACER?.emit({
          type: TracerEventType.Connected,
          id: CURRENT_CONSUMER._opts.id,
          childId: this._opts.id,
          name: this._opts.desc,
          params: this._opts.params,
          nodeType: signalTypeToVisualizerType(this._type),
        });
      }

      const ord = CURRENT_ORD++;

      this._check(!prevLink && connectedCount > 0);

      if (prevLink === undefined) {
        const newLink = {
          dep: this,
          sub: CURRENT_CONSUMER._ref,
          ord,
          version: this._version,
          consumedAt: CURRENT_CONSUMER._computedCount,
          nextDirty: undefined,
        };

        deps.set(this, newLink);
        this._subs.add(newLink);
      } else if (prevLink.consumedAt !== computedCount) {
        prevLink.ord = ord;
        prevLink.version = this._version;
        prevLink.consumedAt = computedCount;
        this._subs.add(prevLink);
      }
    } else {
      this._check();
    }

    return this._currentValue!;
  }

  _check(shouldWatch = false, connectCount = 1, immediate = false): number {
    let state = this._state;
    let connectedCount = this._connectedCount;

    const wasConnected = connectedCount > 0;
    const shouldConnect = shouldWatch && !wasConnected;

    if (shouldWatch) {
      this._connectedCount = connectedCount = connectedCount + connectCount;
    }

    if (shouldConnect) {
      if (this._type === SignalType.Subscription) {
        state = SignalState.Dirty;
      } else {
        for (const [dep, link] of this._deps) {
          if (link.version !== dep._check(true)) {
            state = SignalState.Dirty;
            break;
          }
        }
      }
    }

    if (state === SignalState.Clean) {
      return this._version;
    }

    if (state === SignalState.MaybeDirty) {
      let dirty = this._dirtyDep;

      while (dirty !== undefined) {
        const dep = dirty.dep;

        if (dirty.version !== dep._check()) {
          state = SignalState.Dirty;
          break;
        }

        dirty = dirty.nextDirty;
      }
    }

    if (state === SignalState.Dirty) {
      this._run(wasConnected, shouldConnect, immediate);
    } else {
      this._resetDirty();
    }

    this._state = SignalState.Clean;
    this._dirtyDep = undefined;

    return this._version;
  }

  _run(wasConnected: boolean, shouldConnect: boolean, immediate = false) {
    TRACER?.emit({
      type: TracerEventType.StartUpdate,
      id: this._opts.id,
    });

    const { _type: type } = this;

    const prevConsumer = CURRENT_CONSUMER;

    try {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      CURRENT_CONSUMER = this;

      this._computedCount++;

      switch (type) {
        case SignalType.Computed: {
          const version = this._version;
          const prevValue = this._currentValue as T | undefined;
          const nextValue = (this._compute as SignalCompute<T>)(prevValue);

          if (version === 0 || !this._opts.equals(prevValue!, nextValue)) {
            this._currentValue = nextValue;
            this._version = version + 1;
          }

          break;
        }

        case SignalType.Async: {
          const value: AsyncResult<T> = this._currentValue as AsyncResult<T>;

          let nextValue;

          try {
            CURRENT_IS_WAITING = false;
            nextValue = (this._compute as SignalAsyncCompute<T>)(value?.result);
          } catch (e) {
            if (e !== WAITING) {
              value.error = e;
              value.isPending = false;
              value.isError = true;
              this._version++;
              break;
            }
          }

          if (CURRENT_IS_WAITING) {
            if (!value.isPending) {
              value.isPending = true;
              value.isError = false;
              value.isSuccess = false;
              this._version++;
            }

            if (nextValue instanceof Promise) {
              nextValue.catch((e: unknown) => {
                if (e !== WAITING) {
                  value.error = e;
                  value.isPending = false;
                  value.isError = true;
                  this._version++;
                }
              });
            }
          } else if (nextValue instanceof Promise) {
            const currentVersion = ++this._version;

            TRACER?.emit({
              type: TracerEventType.StartLoading,
              id: this._opts.id,
            });

            nextValue = nextValue
              .then(
                result => {
                  if (currentVersion !== this._version) {
                    return;
                  }

                  value.result = result;
                  value.isReady = true;
                  value.didResolve = true;

                  value.isPending = false;
                  value.isSuccess = true;

                  this._version++;
                  scheduleDirty(this);
                },
                error => {
                  if (currentVersion !== this._version || error === WAITING) {
                    return;
                  }

                  value.error = error;
                  value.isPending = false;
                  value.isError = true;
                  this._version++;
                  scheduleDirty(this);
                },
              )
              .finally(() => {
                TRACER?.emit({
                  type: TracerEventType.EndLoading,
                  id: this._opts.id,
                  value: value,
                });
              });

            ACTIVE_ASYNCS.set(this, nextValue);

            value.isPending = true;
            value.isError = false;
            value.isSuccess = false;
          } else {
            value.result = nextValue as T;
            value.isReady = true;
            value.isPending = false;
            value.isSuccess = true;
            value.isError = false;

            this._version++;

            TRACER?.emit({
              type: TracerEventType.EndLoading,
              id: this._opts.id,
              value: value,
            });
          }

          break;
        }

        case SignalType.Subscription: {
          if (shouldConnect) {
            const subscription = (this._compute as SignalSubscribe<T>)(
              () => this._currentValue as T,
              value => {
                const version = this._version;

                if (version !== 0 && this._opts.equals(value, this._currentValue as T)) {
                  return;
                }

                TRACER?.emit({
                  type: TracerEventType.StartUpdate,
                  id: this._opts.id,
                });

                this._currentValue = value;
                this._version = version + 1;
                this._dirtyConsumers();

                TRACER?.emit({
                  type: TracerEventType.EndUpdate,
                  id: this._opts.id,
                  value: this._currentValue,
                  preserveChildren: true,
                });
              },
            );
            SUBSCRIPTIONS.set(this, subscription);
          } else {
            const subscription = SUBSCRIPTIONS.get(this);

            subscription?.update?.();
          }

          break;
        }

        default: {
          const version = this._version;
          const prevValue = this._currentValue as T | undefined;
          const nextValue = (this._compute as SignalCompute<T>)(prevValue);

          if (version === 0 || !this._opts.equals(prevValue!, nextValue)) {
            this._currentValue = nextValue;
            this._version = version + 1;

            if (immediate) {
              this._runEffects();
            } else {
              scheduleEffect(this);
            }
          }

          break;
        }
      }
    } finally {
      TRACER?.emit({
        type: TracerEventType.EndUpdate,
        id: this._opts.id,
        value: this._currentValue,
      });

      if (this._type !== SignalType.Watcher) {
        const deps = this._deps;

        for (const link of deps.values()) {
          if (link.consumedAt === this._computedCount) continue;

          const dep = link.dep;

          if (wasConnected) {
            scheduleDisconnect(dep);
          }

          TRACER?.emit({
            type: TracerEventType.Disconnected,
            id: this._opts.id,
            childId: dep._opts.id,
          });

          deps.delete(dep);
          dep._subs.delete(link);
        }
      }

      CURRENT_CONSUMER = prevConsumer;
    }
  }

  _resetDirty() {
    let dirty = this._dirtyDep;

    while (dirty !== undefined) {
      dirty.dep._subs.add(dirty);

      let nextDirty = dirty.nextDirty;
      dirty.nextDirty = undefined;
      dirty = nextDirty;
    }
  }

  _dirty() {
    if (this._type === SignalType.Subscription) {
      if (this._connectedCount > 0) {
        scheduleWatcher(this);
      }

      // else do nothing, only schedule if connected
    } else if (this._type === SignalType.Watcher) {
      scheduleWatcher(this);
    } else {
      this._dirtyConsumers();
    }
  }

  _dirtyConsumers() {
    for (const link of this._subs.values()) {
      const sub = link.sub.deref();

      if (sub === undefined) continue;

      switch (sub._state) {
        case SignalState.MaybeDirty: {
          let dirty = sub._dirtyDep;
          const ord = link.ord;
          if (dirty!.ord > ord) {
            sub._dirtyDep = link;
            link.nextDirty = dirty;
          } else {
            let nextDirty = dirty!.nextDirty;
            while (nextDirty !== undefined && nextDirty!.ord < ord) {
              dirty = nextDirty;
              nextDirty = dirty.nextDirty;
            }
            link.nextDirty = nextDirty;
            dirty!.nextDirty = link;
          }
          break;
        }
        case SignalState.Clean: {
          sub._state = SignalState.MaybeDirty;
          sub._dirtyDep = link;
          link.nextDirty = undefined;
          sub._dirty();
        }
      }
    }

    this._subs = new Set();
  }

  _disconnect(count = 1) {
    this._connectedCount -= count;

    if (this._connectedCount > 0) {
      return;
    } else if (this._connectedCount < 0) {
      throw new Error('Signal disconnect count cannot be negative');
    }

    if (this._type === SignalType.Subscription) {
      const subscription = SUBSCRIPTIONS.get(this);

      if (subscription !== undefined) {
        subscription.unsubscribe?.();
        SUBSCRIPTIONS.delete(this);
      }
    }

    for (const link of this._deps.values()) {
      const dep = link.dep;

      dep._disconnect();
    }
  }

  _runEffects() {
    for (const subscriber of this._opts.subscribers!) {
      subscriber(this._currentValue as T);
    }
  }

  addListener(subscriber: (value: T) => void, opts?: WatcherListenerOptions) {
    const subscribers = this._opts.subscribers!;
    const index = subscribers.indexOf(subscriber);

    if (index === -1) {
      subscribers.push(subscriber);

      if (opts?.immediate) {
        this._check(true, 1, true);
      } else {
        scheduleConnect(this);
      }
    }

    return () => {
      const index = subscribers.indexOf(subscriber);

      if (index !== -1) {
        subscribers.splice(index, 1);
        scheduleDisconnect(this);
      }
    };
  }
}

let STATE_ID = 0;

export class StateSignal<T> implements StateSignal<T> {
  _subs: WeakRef<ComputedSignal<unknown>>[] = [];
  _desc: string;

  constructor(
    private _value: T,
    private _equals: SignalEquals<T> = (a, b) => a === b,
    desc: string = 'state',
  ) {
    this._desc = `${desc}${STATE_ID++}`;
  }

  get(): T {
    if (CURRENT_CONSUMER !== undefined) {
      TRACER?.emit({
        type: TracerEventType.ConsumeState,
        id: CURRENT_CONSUMER._opts.id,
        childId: this._desc,
        value: this._value,
        setValue: (value: unknown) => {
          this.set(value as T);
        },
      });
      this._subs.push(CURRENT_CONSUMER._ref);
    }

    return this._value!;
  }

  set(value: T) {
    if (this._equals(value, this._value)) {
      return;
    }

    this._value = value;
    const subs = this._subs;
    const subsLength = subs.length;

    for (let i = 0; i < subsLength; i++) {
      const sub = subs[i].deref();

      if (sub === undefined) {
        continue;
      }

      switch (sub._state) {
        case SignalState.Clean:
          sub._state = SignalState.Dirty;
          sub._dirty();
          break;
        case SignalState.MaybeDirty:
          sub._state = SignalState.Dirty;
          break;
      }
    }

    this._subs = [];
  }
}

let UNKNOWN_SIGNAL_ID = 0;

const normalizeOpts = <T>(
  opts?: SignalOptions<T, unknown[]> & { subscribers?: ((value: T) => void)[] },
): InternalSignalOptions<T> => {
  return {
    equals: opts?.equals === false ? FALSE_EQUALS : (opts?.equals ?? ((a, b) => a === b)),
    id: opts?.id ?? `unknownSignal${UNKNOWN_SIGNAL_ID++}`,
    desc: opts?.desc,
    params: opts?.params,
  };
};

export function createStateSignal<T>(
  initialValue: T,
  opts?: Omit<SignalOptions<T, unknown[]>, 'paramKey'>,
): StateSignal<T> {
  const equals = opts?.equals === false ? FALSE_EQUALS : (opts?.equals ?? ((a, b) => a === b));

  return new StateSignal(initialValue, equals, opts?.desc);
}

export function createComputedSignal<T>(
  compute: (prev: T | undefined) => T,
  opts?: SignalOptions<T, unknown[]>,
): Signal<T> {
  return new ComputedSignal(SignalType.Computed, compute, normalizeOpts(opts)) as Signal<T>;
}

export function createAsyncComputedSignal<T>(
  compute: (prev: T | undefined) => Promise<T>,
  opts?: SignalOptions<T, unknown[]>,
): AsyncSignal<T>;
export function createAsyncComputedSignal<T>(
  compute: (prev: T | undefined) => Promise<T>,
  opts: SignalOptionsWithInit<T, unknown[]>,
): AsyncSignal<T>;
export function createAsyncComputedSignal<T>(
  compute: (prev: T | undefined) => Promise<T>,
  opts?: Partial<SignalOptionsWithInit<T, unknown[]>>,
): AsyncSignal<T> {
  return new ComputedSignal(SignalType.Async, compute, normalizeOpts(opts), opts?.initValue) as AsyncSignal<T>;
}

export function createSubscriptionSignal<T>(
  subscribe: SignalSubscribe<T>,
  opts?: SignalOptions<T, unknown[]>,
): Signal<T | undefined>;
export function createSubscriptionSignal<T>(
  subscribe: SignalSubscribe<T>,
  opts: SignalOptionsWithInit<T, unknown[]>,
): Signal<T>;
export function createSubscriptionSignal<T>(
  subscribe: SignalSubscribe<T>,
  opts?: Partial<SignalOptionsWithInit<T, unknown[]>>,
): Signal<T> {
  return new ComputedSignal(SignalType.Subscription, subscribe, normalizeOpts(opts), opts?.initValue) as Signal<T>;
}

export function createAsyncTaskSignal<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
): Signal<AsyncTask<T, Args>> {
  let currentPromise: Promise<T> | undefined;

  const task: AsyncTask<T, Args> = {
    result: undefined,
    error: undefined,
    isPending: false,
    isSuccess: false,
    isError: false,
    isReady: false,

    async run(...params) {
      if (!task.isPending) {
        currentPromise = run(...params);
      }

      return currentPromise!;
    },
  };

  const run = async (...params: Args) => {
    try {
      task.isPending = true;
      task.isError = false;
      task.isSuccess = false;

      signal.set(task);

      const result = await fn(...params);

      task.result = result;
      task.isSuccess = true;
      task.isReady = true;

      return result;
    } catch (error) {
      task.error = error;
      task.isError = true;

      throw error;
    } finally {
      task.isPending = false;
      signal.set(task);
    }
  };

  const signal = createStateSignal<AsyncTask<T, Args>>(task, { equals: false });

  return signal;
}

export function createWatcherSignal<T>(fn: (prev: T | undefined) => T, opts?: SignalOptions<T, unknown[]>): Watcher<T> {
  const normalizedOpts = normalizeOpts({
    equals: FALSE_EQUALS,
    subscribers: [],
    ...opts,
  });

  normalizedOpts.subscribers = [];

  return new ComputedSignal(SignalType.Watcher, fn, normalizedOpts);
}

export function getCurrentConsumer(): ComputedSignal<any> | undefined {
  return CURRENT_CONSUMER;
}

export function isTracking(): boolean {
  return CURRENT_CONSUMER !== undefined;
}

export function untrack<T = void>(fn: () => T): T {
  const prevConsumer = CURRENT_CONSUMER;

  try {
    CURRENT_CONSUMER = undefined;

    return fn();
  } finally {
    CURRENT_CONSUMER = prevConsumer;
  }
}
