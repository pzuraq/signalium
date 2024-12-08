import { scheduleDisconnect, scheduleWatcher } from './scheduling.js';

let CURRENT_CONSUMER: ComputedSignal<any> | undefined;
let CURRENT_DEP_TAIL: Link | undefined;
let CURRENT_ORD: number = 0;
let CURRENT_IS_WATCHED: boolean = false;
let CURRENT_IS_WAITING: boolean = false;
let CURRENT_SEEN: WeakSet<ComputedSignal<any>> | undefined;

let id = 0;

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
  id: number;
  sub: WeakRef<ComputedSignal<any>>;
  dep: ComputedSignal<any>;
  ord: number;
  version: number;

  nextDep: Link | undefined;
  nextSub: Link | undefined;
  prevSub: Link | undefined;

  nextDirty: Link | undefined;
}

let linkPool: Link | undefined;

const checkForCircularLinks = (link: Link | undefined) => {
  if (!link) return;

  for (const key of ['nextDep', 'nextSub', 'prevSub', 'nextDirty'] as const) {
    let currentLink: Link | undefined = link?.[key];

    while (currentLink !== undefined) {
      if (currentLink === link) {
        throw new Error(
          `Circular link detected via ${key}. This is a bug, please report it to the Signalium maintainers.`,
        );
      }

      currentLink = currentLink[key];
    }
  }
};

const typeToString = (type: SignalType) => {
  switch (type) {
    case SignalType.Computed:
      return 'Computed';
    case SignalType.Subscription:
      return 'Subscription';
    case SignalType.Async:
      return 'Async';
    case SignalType.Watcher:
      return 'Watcher';
  }
};

const printComputed = (computed: ComputedSignal<any>) => {
  const type = typeToString(computed._type);

  return `ComputedSignal<${type}:${computed.id}>`;
};

const printLink = (link: Link) => {
  const sub = link.sub.deref();
  const subStr = sub === undefined ? 'undefined' : printComputed(sub);
  const depStr = printComputed(link.dep);

  return `Link<${link.id}> sub(${subStr}) -> dep(${depStr})`;
};

function linkNewDep(
  dep: ComputedSignal<any>,
  sub: ComputedSignal<any>,
  nextDep: Link | undefined,
  depsTail: Link | undefined,
  ord: number,
): Link {
  let newLink: Link;

  if (linkPool !== undefined) {
    newLink = linkPool;
    linkPool = newLink.nextDep;
    newLink.nextDep = nextDep;
    newLink.dep = dep;
    newLink.sub = sub._ref;
    newLink.ord = ord;
  } else {
    newLink = {
      id: id++,
      dep,
      sub: sub._ref,
      ord,
      version: 0,
      nextDep,
      nextDirty: undefined,
      prevSub: undefined,
      nextSub: undefined,
    };
  }

  if (depsTail === undefined) {
    sub._deps = newLink;
  } else {
    depsTail.nextDep = newLink;
  }

  if (dep._subs === undefined) {
    dep._subs = newLink;
  } else {
    const oldTail = dep._subsTail!;
    newLink.prevSub = oldTail;
    oldTail.nextSub = newLink;
  }

  dep._subsTail = newLink;

  return newLink;
}

function poolLink(link: Link) {
  const dep = link.dep;
  const nextSub = link.nextSub;
  const prevSub = link.prevSub;

  if (nextSub !== undefined) {
    nextSub.prevSub = prevSub;
    link.nextSub = undefined;
  } else {
    dep._subsTail = prevSub;
  }

  if (prevSub !== undefined) {
    prevSub.nextSub = nextSub;
    link.prevSub = undefined;
  } else {
    dep._subs = nextSub;
  }

  // @ts-expect-error - override to pool the value
  link.dep = undefined;
  // @ts-expect-error - override to pool the value
  link.sub = undefined;
  link.nextDep = linkPool;
  linkPool = link;

  link.prevSub = undefined;
}

export function endTrack(sub: ComputedSignal<any>, shouldDisconnect: boolean): void {
  if (CURRENT_DEP_TAIL !== undefined) {
    if (CURRENT_DEP_TAIL.nextDep !== undefined) {
      clearTrack(CURRENT_DEP_TAIL.nextDep, shouldDisconnect);
      CURRENT_DEP_TAIL.nextDep = undefined;
    }
  } else if (sub._deps !== undefined) {
    clearTrack(sub._deps, shouldDisconnect);
    sub._deps = undefined;
  }
}

function clearTrack(link: Link, shouldDisconnect: boolean): void {
  do {
    const nextDep = link.nextDep;

    if (shouldDisconnect) {
      scheduleDisconnect(link.dep);
    }

    poolLink(link);

    link = nextDep!;
  } while (link !== undefined);
}

export class ComputedSignal<T> {
  id = id++;
  _type: SignalType;

  _subs: Link | undefined;
  _subsTail: Link | undefined;

  _deps: Link | undefined;
  _dirtyDep: Link | undefined;

  _state: SignalState = SignalState.Dirty;

  _version: number = 0;

  _connectedCount: number;

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
                ACTIVE_ASYNCS.get(this)?.finally(() => currentConsumer._check());

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
    let prevTracked = false;

    if (CURRENT_CONSUMER !== undefined && this._type !== SignalType.Watcher && !CURRENT_SEEN!.has(this)) {
      const ord = CURRENT_ORD++;

      const nextDep = CURRENT_DEP_TAIL === undefined ? CURRENT_CONSUMER._deps : CURRENT_DEP_TAIL.nextDep;
      let newLink: Link | undefined = nextDep;

      while (newLink !== undefined) {
        if (newLink.dep === this) {
          prevTracked = true;

          if (CURRENT_DEP_TAIL === undefined) {
            CURRENT_CONSUMER._deps = newLink;
          } else {
            CURRENT_DEP_TAIL.nextDep = newLink;
          }

          newLink.ord = ord;
          newLink.nextDirty = undefined;

          if (this._subs === undefined) {
            this._subs = newLink;
          }

          break;
        }

        newLink = newLink.nextDep;
      }

      this._check(CURRENT_IS_WATCHED && !prevTracked);

      CURRENT_DEP_TAIL = newLink ?? linkNewDep(this, CURRENT_CONSUMER, nextDep, CURRENT_DEP_TAIL, ord);

      if (process.env.NODE_ENV !== 'production') checkForCircularLinks(CURRENT_DEP_TAIL);

      CURRENT_DEP_TAIL.version = this._version;
      CURRENT_SEEN!.add(this);
    } else {
      this._check();
    }

    return this._currentValue!;
  }

  _check(shouldWatch = false): number {
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
        let link = this._deps;

        if (process.env.NODE_ENV !== 'production') checkForCircularLinks(link);

        while (link !== undefined) {
          const dep = link.dep;

          if (link.version !== dep._check(true)) {
            state = SignalState.Dirty;
            break;
          }

          link = link.nextDep;
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
      this._run(wasConnected, connectedCount > 0, shouldConnect);
    } else {
      this._resetDirty();
    }

    this._state = SignalState.Clean;
    this._dirtyDep = undefined;

    return this._version;
  }

  _run(wasConnected: boolean, isConnected: boolean, shouldConnect: boolean) {
    const { _type: type } = this;

    const prevConsumer = CURRENT_CONSUMER;
    const prevOrd = CURRENT_ORD;
    const prevSeen = CURRENT_SEEN;
    const prevDepTail = CURRENT_DEP_TAIL;
    const prevIsWatched = CURRENT_IS_WATCHED;

    try {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      CURRENT_CONSUMER = this;
      CURRENT_ORD = 0;
      CURRENT_SEEN = new WeakSet();
      CURRENT_DEP_TAIL = undefined;
      CURRENT_IS_WATCHED = isConnected;

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
                this._dirtyConsumers();
              },
              error => {
                if (currentVersion !== this._version || error === WAITING) {
                  return;
                }

                value.error = error;
                value.isPending = false;
                value.isError = true;
                this._version++;
                this._dirtyConsumers();
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
      endTrack(this, wasConnected);

      CURRENT_CONSUMER = prevConsumer;
      CURRENT_SEEN = prevSeen;
      CURRENT_DEP_TAIL = prevDepTail;
      CURRENT_ORD = prevOrd;
      CURRENT_IS_WATCHED = prevIsWatched;
    }
  }

  _resetDirty() {
    let dirty = this._dirtyDep;

    while (dirty !== undefined) {
      const dep = dirty.dep;
      const oldHead = dep._subs;

      if (oldHead === undefined) {
        dep._subs = dirty;
        dirty.nextSub = undefined;
        dirty.prevSub = undefined;
      } else {
        dirty.nextSub = oldHead;
        dirty.prevSub = undefined;
        oldHead.prevSub = dirty;
        dep._subs = dirty;
      }

      if (process.env.NODE_ENV !== 'production') {
        checkForCircularLinks(this._dirtyDep);
      }

      let nextDirty = dirty.nextDirty;
      dirty.nextDirty = undefined;
      dirty = nextDirty;
    }

    if (process.env.NODE_ENV !== 'production') checkForCircularLinks(this._dirtyDep);
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

    this._subs = undefined;
  }

  _dirtyConsumers() {
    let link = this._subs;

    if (process.env.NODE_ENV !== 'production') checkForCircularLinks(link);

    while (link !== undefined) {
      const consumer = link.sub.deref();

      if (consumer === undefined) {
        const nextSub = link.nextSub;
        poolLink(link);
        link = nextSub;
        continue;
      }

      const state = consumer._state;

      if (state === SignalState.Dirty) {
        const nextSub = link.nextSub;
        link = nextSub;
        continue;
      }

      if (state === SignalState.MaybeDirty) {
        let dirty = consumer._dirtyDep;
        const ord = link.ord;

        if (dirty!.ord > ord) {
          consumer._dirtyDep = link;
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
      } else {
        // consumer._dirtyQueueLength = dirtyQueueLength + 2;
        consumer._state = SignalState.MaybeDirty;
        consumer._dirtyDep = link;
        link.nextDirty = undefined;
        consumer._dirty();
      }

      link = link.nextSub;
    }
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

    let link = this._deps;

    while (link !== undefined) {
      const dep = link.dep;

      dep._disconnect();

      link = link.nextDep;
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
  private _consumers: WeakRef<ComputedSignal<unknown>>[] = [];

  constructor(
    private _value: T,
    private _equals: SignalEquals<T> = (a, b) => a === b,
  ) {}

  get(): T {
    if (CURRENT_CONSUMER !== undefined) {
      this._consumers.push(CURRENT_CONSUMER._ref);
    }

    return this._value!;
  }

  set(value: T) {
    if (this._equals(value, this._value)) {
      return;
    }

    this._value = value;

    const { _consumers: consumers } = this;

    for (const consumerRef of consumers) {
      const consumer = consumerRef.deref();

      if (consumer === undefined) {
        continue;
      }

      consumer._state = SignalState.Dirty;
      consumer._dirty();
    }

    consumers.length = 0;
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
  const subscribers = new Set<() => void>();
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
      subscribers.add(subscriber);

      return () => {
        subscribers.delete(subscriber);
      };
    },
  };
}

export function isTracking(): boolean {
  return CURRENT_CONSUMER !== undefined;
}

export function untrack<T = void>(fn: () => T): T {
  const prevConsumer = CURRENT_CONSUMER;
  const prevOrd = CURRENT_ORD;
  const prevIsWatched = CURRENT_IS_WATCHED;

  try {
    CURRENT_CONSUMER = undefined;
    // LAST_CONSUMED = undefined;
    CURRENT_ORD = 0;
    CURRENT_IS_WATCHED = false;

    return fn();
  } finally {
    CURRENT_CONSUMER = prevConsumer;
    CURRENT_ORD = prevOrd;
    CURRENT_IS_WATCHED = prevIsWatched;
  }
}
