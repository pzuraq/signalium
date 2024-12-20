import { scheduleDirty, scheduleDisconnect, schedulePull, scheduleWatcher } from './scheduling.js';
import WeakRef from './weakref.js';

let CURRENT_ORD = 0;
let CURRENT_CONSUMER: ComputedSignal<any> | undefined;
let CURRENT_IS_WAITING: boolean = false;

let ID = 0;

const enum SignalType {
  Computed,
  Subscription,
  Async,
  Watcher,
}

export interface Signal<T = unknown> {
  get(): T;
}

export interface WriteableSignal<T> extends Signal<T> {
  set(value: T): void;
}

export type AsyncSignal<T> = Signal<AsyncResult<T>>;

export type SignalCompute<T> = (prev: T | undefined) => T;

export type SignalAsyncCompute<T> = (prev: T | undefined) => T | Promise<T>;

export type SignalWatcherEffect = () => void;

export type SignalEquals<T> = (prev: T, next: T) => boolean;

export type SignalSubscription = {
  update?(): void;
  unsubscribe?(): void;
};

export type SignalSubscribe<T> = (get: () => T, set: (value: T) => void) => SignalSubscription | undefined | void;

export interface SignalOptions<T> {
  equals?: SignalEquals<T>;
}

export interface SignalOptionsWithInit<T> extends SignalOptions<T> {
  initValue: T;
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

export class ComputedSignal<T> {
  _id = ID++;
  _type: SignalType;

  _deps = new Map<ComputedSignal<any>, Link>();

  _dirtyDep: Link | undefined = undefined;
  _subs = new Set<Link>();
  _state: SignalState = SignalState.Dirty;
  _version: number = 0;
  _computedCount: number = 0;
  _connectedCount: number = 0;
  _currentValue: T | AsyncResult<T> | undefined;
  _compute: SignalCompute<T> | SignalAsyncCompute<T> | SignalSubscribe<T> | undefined;

  _equals: SignalEquals<T>;
  _ref: WeakRef<ComputedSignal<T>> = new WeakRef(this);

  constructor(
    type: SignalType,
    compute: SignalCompute<T> | SignalAsyncCompute<T> | SignalSubscribe<T> | undefined,
    equals?: SignalEquals<T>,
    initValue?: T,
  ) {
    this._type = type;
    this._compute = compute;
    this._equals = equals ?? ((a, b) => a === b);
    this._connectedCount = type === SignalType.Watcher ? 1 : 0;

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
        // prevLink.nextDirty = undefined;
        this._subs.add(prevLink);
      }
    } else {
      this._check();
    }

    return this._currentValue!;
  }

  _check(shouldWatch = false): number {
    // COUNTS.checks++;
    let state = this._state;
    let connectedCount = this._connectedCount;

    const wasConnected = connectedCount > 0;
    const shouldConnect = shouldWatch && !wasConnected;

    if (shouldWatch) {
      this._connectedCount = connectedCount = connectedCount + 1;
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
      this._run(wasConnected, shouldConnect);
    } else {
      this._resetDirty();
    }

    this._state = SignalState.Clean;
    this._dirtyDep = undefined;

    return this._version;
  }

  _run(wasConnected: boolean, shouldConnect: boolean) {
    const { _type: type } = this;

    const prevConsumer = CURRENT_CONSUMER;

    try {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      CURRENT_CONSUMER = this;

      this._computedCount++;

      switch (type) {
        case SignalType.Computed: {
          const prevValue = this._currentValue as T;
          const nextValue = (this._compute as SignalCompute<T>)(prevValue);

          if (!this._equals(prevValue!, nextValue)) {
            this._currentValue = nextValue;
            this._version++;
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

            nextValue = nextValue.then(
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
            );

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
          }

          break;
        }

        case SignalType.Subscription: {
          if (shouldConnect) {
            const subscription = (this._compute as SignalSubscribe<T>)(
              () => this._currentValue as T,
              value => {
                if (this._equals(value, this._currentValue as T)) {
                  return;
                }
                this._currentValue = value;
                this._version++;
                this._dirtyConsumers();
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
          (this._compute as SignalWatcherEffect)!();
        }
      }
    } finally {
      const deps = this._deps;

      for (const link of deps.values()) {
        if (link.consumedAt === this._computedCount) continue;

        const dep = link.dep;

        if (wasConnected) {
          scheduleDisconnect(dep);
        }

        deps.delete(dep);
        dep._subs.delete(link);
      }

      CURRENT_CONSUMER = prevConsumer;
    }
  }

  _resetDirty() {
    let dirty = this._dirtyDep;
    // COUNTS.dirtyResetIterations++;

    while (dirty !== undefined) {
      // COUNTS.dirtyResetIterations++;
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
              // COUNTS.dirtyInsertIterations++;
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
}

export interface AsyncBaseResult<T> {
  invalidate(): void;
  await(): T;
}

export interface AsyncPending<T> extends AsyncBaseResult<T> {
  result: undefined;
  error: unknown;
  isPending: boolean;
  isReady: false;
  isError: boolean;
  isSuccess: boolean;
  didResolve: boolean;
}

export interface AsyncReady<T> extends AsyncBaseResult<T> {
  result: T;
  error: unknown;
  isPending: boolean;
  isReady: true;
  isError: boolean;
  isSuccess: boolean;
  didResolve: boolean;
}

export type AsyncResult<T> = AsyncPending<T> | AsyncReady<T>;

class StateSignal<T> implements StateSignal<T> {
  private _subs: WeakRef<ComputedSignal<unknown>>[] = [];

  constructor(
    private _value: T,
    private _equals: SignalEquals<T> = (a, b) => a === b,
  ) {}

  get(): T {
    if (CURRENT_CONSUMER !== undefined) {
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

export function state<T>(initialValue: T, opts?: SignalOptions<T>): StateSignal<T> {
  return new StateSignal(initialValue, opts?.equals);
}

export function computed<T>(compute: (prev: T | undefined) => T, opts?: SignalOptions<T>): Signal<T> {
  return new ComputedSignal(SignalType.Computed, compute, opts?.equals) as Signal<T>;
}

export function asyncComputed<T>(compute: (prev: T | undefined) => Promise<T>, opts?: SignalOptions<T>): AsyncSignal<T>;
export function asyncComputed<T>(
  compute: (prev: T | undefined) => Promise<T>,
  opts: SignalOptionsWithInit<T>,
): AsyncSignal<T>;
export function asyncComputed<T>(
  compute: (prev: T | undefined) => Promise<T>,
  opts?: Partial<SignalOptionsWithInit<T>>,
): AsyncSignal<T> {
  return new ComputedSignal(SignalType.Async, compute, opts?.equals, opts?.initValue) as AsyncSignal<T>;
}

export function subscription<T>(subscribe: SignalSubscribe<T>, opts?: SignalOptions<T>): Signal<T | undefined>;
export function subscription<T>(subscribe: SignalSubscribe<T>, opts: SignalOptionsWithInit<T>): Signal<T>;
export function subscription<T>(subscribe: SignalSubscribe<T>, opts?: Partial<SignalOptionsWithInit<T>>): Signal<T> {
  return new ComputedSignal(SignalType.Subscription, subscribe, opts?.equals, opts?.initValue) as Signal<T>;
}

export interface Watcher {
  disconnect(): void;
  subscribe(subscriber: () => void): () => void;
}

export function watcher(fn: () => void): Watcher {
  const subscribers: (() => void)[] = [];
  const watcher = new ComputedSignal(SignalType.Watcher, () => {
    fn();

    untrack(() => {
      for (const subscriber of subscribers) {
        subscriber();
      }
    });
  });

  scheduleWatcher(watcher);

  return {
    disconnect() {
      scheduleDisconnect(watcher);
    },

    subscribe(subscriber: () => void) {
      subscribers.push(subscriber);

      return () => {
        subscribers.splice(subscribers.indexOf(subscriber), 1);
      };
    },
  };
}

export function isTracking(): boolean {
  return CURRENT_CONSUMER !== undefined;
}

export function untrack<T = void>(fn: () => T): T {
  const prevConsumer = CURRENT_CONSUMER;

  try {
    CURRENT_CONSUMER = undefined;
    // LAST_CONSUMED = undefined;

    return fn();
  } finally {
    CURRENT_CONSUMER = prevConsumer;
  }
}
