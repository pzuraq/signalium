import { scheduleDisconnect, scheduleWatcher } from './scheduling';

let CURRENT_CONSUMER: WeakRef<ComputedSignal<any>> | undefined;
let CURRENT_CONSUMED: Set<ComputedSignal<any>> | undefined;
let LAST_CONSUMED: Set<ComputedSignal<any>> | undefined;
let CURRENT_ORD: number = 0;
let CURRENT_IS_WATCHED: boolean = false;

let CLOCK = 0;

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

export type SignalCompute<T> = (prev: T | undefined) => T;

export type SignalAsyncCompute<T> = (prev: T | undefined) => T | Promise<T>;

export type SignalWatcherEffect = () => void;

export type SignalEquals<T> = (prev: T, next: T) => boolean;

export type SignalSubscription = {
  update?(): void;
  unsubscribe?(): void;
};

export type SignalSubscribe<T> = (
  get: () => T,
  set: (value: T) => void
) => SignalSubscription | undefined | void;

export interface SignalOptions<T> {
  equals?: SignalEquals<T>;
}

export interface SignalOptionsWithInit<T> extends SignalOptions<T> {
  initValue: T;
}

const CANCELLED_REFS = new WeakSet<WeakRef<ComputedSignal<any>>>();

function derefSignal<T>(
  ref: WeakRef<ComputedSignal<T>>
): ComputedSignal<T> | undefined {
  return CANCELLED_REFS.has(ref) ? undefined : ref.deref();
}

const SUBSCRIPTIONS = new WeakMap<
  ComputedSignal<any>,
  SignalSubscription | undefined | void
>();

export class ComputedSignal<T> {
  _type: SignalType;

  // Map from consumer signals to the ord of this signals consumption in the
  // consumer. So if this is the first signal consumed in that context, it would
  // be [ConsumerSignal, 0] for instance. Ords are used to build a priority
  // queue for updates that allows us to skip a second downward step.
  _consumers: Map<WeakRef<ComputedSignal<any>>, number> = new Map();
  _consumed: Set<ComputedSignal<any>> | undefined;
  _dirtyQueue: (ComputedSignal<any> | number)[] | boolean = true;
  _updatedAt: number = -1;

  _connectedCount: number;

  _currentValue: T | AsyncResult<T> | undefined;
  _compute:
    | SignalCompute<T>
    | SignalAsyncCompute<T>
    | SignalSubscribe<T>
    | undefined;
  _equals: SignalEquals<T>;
  _ref: WeakRef<ComputedSignal<T>> | undefined;

  constructor(
    type: SignalType,
    compute:
      | SignalCompute<T>
      | SignalAsyncCompute<T>
      | SignalSubscribe<T>
      | undefined,
    equals?: SignalEquals<T>,
    initValue?: T
  ) {
    this._type = type;
    this._compute = compute;
    this._equals = equals ?? ((a, b) => a === b);
    this._currentValue = initValue;
    this._connectedCount = type === SignalType.Watcher ? 1 : 0;
  }

  get(): T | AsyncResult<T> {
    const consumers = this._consumers;

    if (
      this._type !== SignalType.Watcher &&
      CURRENT_CONSUMER !== undefined &&
      !consumers.has(CURRENT_CONSUMER)
    ) {
      const prevConsumed = LAST_CONSUMED?.delete(this);
      CURRENT_CONSUMED!.add(this);

      this._check(CURRENT_IS_WATCHED && !prevConsumed);

      consumers.set(CURRENT_CONSUMER!, CURRENT_ORD++);
    } else {
      this._check();
    }

    return this._currentValue!;
  }

  _check(shouldWatch = false): number {
    let queue = this._dirtyQueue;
    let updated = this._updatedAt;
    let connectedCount = this._connectedCount;

    const wasConnected = connectedCount > 0;
    const shouldConnect = shouldWatch && !wasConnected;

    if (shouldWatch) {
      this._connectedCount = connectedCount = connectedCount + 1;
    }

    if (shouldConnect) {
      if (this._type === SignalType.Subscription) {
        queue = true;
      } else {
        const consumed = this._consumed!;

        if (consumed !== undefined) {
          for (const signal of consumed) {
            if (updated < signal._check(true)) {
              queue = true;
              break;
            }
          }
        }

        if (Array.isArray(queue)) {
          for (let i = 0; i < queue.length; i += 2) {
            const signal = queue[i + 1] as ComputedSignal<any>;

            signal._consumers!.set(this._ref!, queue[i] as number);
          }

          this._dirtyQueue = queue = false;
        }
      }
    }

    if (queue === false) {
      return updated;
    }

    if (Array.isArray(queue)) {
      for (let i = 0; i < queue.length; i += 2) {
        const signal = queue[i + 1] as ComputedSignal<any>;

        if (updated < signal._check()) {
          queue = true;
          break;
        } else {
          signal._consumers!.set(this._ref!, queue[i] as number);
        }
      }
    }

    if (queue === true) {
      const { _ref, _type } = this;

      if (_ref) {
        CANCELLED_REFS.add(_ref);
      }

      const prevConsumer = CURRENT_CONSUMER;
      const prevConsumed = CURRENT_CONSUMED;
      const prevLastConsumed = LAST_CONSUMED;
      const prevOrd = CURRENT_ORD;
      const prevIsWatched = CURRENT_IS_WATCHED;

      try {
        CURRENT_CONSUMER = this._ref = new WeakRef(this);
        LAST_CONSUMED = this._consumed;
        CURRENT_CONSUMED = this._consumed = new Set();
        CURRENT_ORD = 0;
        CURRENT_IS_WATCHED = this._connectedCount > 0;

        if (_type === SignalType.Computed) {
          const prevValue = this._currentValue as T;
          const nextValue = (this._compute as SignalCompute<T>)(prevValue);

          if (updated === -1 || !this._equals(prevValue!, nextValue)) {
            this._currentValue = nextValue;
            this._updatedAt = CLOCK++;
          }
        } else if (_type === SignalType.Async) {
          const currentRef = this._ref;

          const value =
            (this._currentValue as AsyncResult<T>) ??
            (this._currentValue = {
              result: undefined,
              error: undefined,
              isPending: true,
              isReady: false,
              isError: false,
              isSuccess: false,
            });

          const nextValue = (this._compute as SignalAsyncCompute<T>)(
            value?.result
          );

          if (typeof (nextValue as Promise<T>)?.then === 'function') {
            (nextValue as Promise<T>).then(
              (result) => {
                if (CANCELLED_REFS.has(currentRef)) {
                  return;
                }

                value.result = result;
                value.isReady = true;

                value.isPending = false;
                value.isSuccess = true;

                this._updatedAt = CLOCK++;
                this._dirtyConsumers();
              },
              (error) => {
                if (CANCELLED_REFS.has(currentRef)) {
                  return;
                }

                value.error = error;
                value.isPending = false;
                value.isError = true;
                this._updatedAt = CLOCK++;
                this._dirtyConsumers();
              }
            );

            value.isPending = true;
            value.isError = false;
            value.isSuccess = false;
            this._updatedAt = CLOCK++;
          } else {
            value.result = nextValue as T;
            value.isReady = true;
            value.isPending = false;
            value.isSuccess = true;
            value.isError = false;

            this._updatedAt = CLOCK++;
          }
        } else if (_type === SignalType.Subscription) {
          if (shouldConnect) {
            const subscription = (this._compute as SignalSubscribe<T>)(
              () => this._currentValue as T,
              (value) => {
                if (
                  this._updatedAt !== -1 &&
                  this._equals(value, this._currentValue as T)
                ) {
                  return;
                }

                this._currentValue = value;
                this._updatedAt = CLOCK++;
                this._dirtyConsumers();
              }
            );

            SUBSCRIPTIONS.set(this, subscription);
          } else {
            (this._compute as SignalSubscription)!.update?.();
          }
        } else {
          (this._compute as SignalWatcherEffect)!();
          this._updatedAt = CLOCK++;
        }
      } finally {
        if (wasConnected && LAST_CONSUMED !== undefined) {
          for (const signal of LAST_CONSUMED) {
            scheduleDisconnect(signal);
          }
        }

        CURRENT_CONSUMER = prevConsumer;
        LAST_CONSUMED = prevLastConsumed;
        CURRENT_CONSUMED = prevConsumed;
        CURRENT_ORD = prevOrd;
        CURRENT_IS_WATCHED = prevIsWatched;
      }
    }

    this._dirtyQueue = false;

    return this._updatedAt;
  }

  _dirty() {
    if (this._type === SignalType.Subscription) {
      if (this._connectedCount > 0) {
        scheduleWatcher(this);
      }

      // else do nothing, only schedul if connected
    } else if (this._type === SignalType.Watcher) {
      scheduleWatcher(this);
    } else {
      this._dirtyConsumers();
    }
  }

  _dirtyConsumers() {
    const consumers = this._consumers;

    for (const [consumerRef, ord] of consumers) {
      const consumer = derefSignal(
        consumerRef as WeakRef<ComputedSignal<unknown>>
      );

      if (consumer === undefined) {
        continue;
      }

      let dirtyQueue = consumer._dirtyQueue;

      if (dirtyQueue === true) {
        continue;
      } else if (dirtyQueue === false) {
        consumer._dirtyQueue = dirtyQueue = [];
      }

      priorityQueueInsert(dirtyQueue, this, ord);

      consumer._dirty();
    }

    consumers.clear();
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

    for (const consumed of this._consumed!) {
      consumed._disconnect();
    }
  }
}

export interface AsyncPending<T> {
  result: undefined;
  error: unknown;
  isPending: boolean;
  isReady: false;
  isError: boolean;
  isSuccess: boolean;
}

export interface AsyncReady<T> {
  result: T;
  error: unknown;
  isPending: boolean;
  isReady: true;
  isError: boolean;
  isSuccess: boolean;
}

export type AsyncResult<T> = AsyncPending<T> | AsyncReady<T>;

class StateSignal<T> implements StateSignal<T> {
  private _consumers: WeakRef<ComputedSignal<unknown>>[] = [];

  constructor(
    private _value: T,
    private _equals: SignalEquals<T> = (a, b) => a === b
  ) {}

  get(): T {
    if (CURRENT_CONSUMER !== undefined) {
      this._consumers.push(CURRENT_CONSUMER);
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
      const consumer = derefSignal(consumerRef);

      if (consumer === undefined) {
        continue;
      }

      consumer._dirtyQueue = true;
      consumer._dirty();
    }

    consumers.length = 0;
  }
}

function priorityQueueInsert<T>(
  queue: (ComputedSignal<any> | number)[],
  signal: ComputedSignal<any>,
  ord: number
): void {
  let left = 0,
    right = queue.length / 2;

  // Perform binary search to find the correct insertion index
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if ((queue[mid * 2] as number) < ord) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  // Insert the new tuple at the found index
  queue.splice(left * 2, 0, ord, signal);
}

export function state<T>(
  initialValue: T,
  opts?: SignalOptions<T>
): StateSignal<T> {
  return new StateSignal(initialValue, opts?.equals);
}

export function computed<T>(
  compute: (prev: T | undefined) => T,
  opts?: SignalOptions<T>
): Signal<T> {
  return new ComputedSignal(
    SignalType.Computed,
    compute,
    opts?.equals
  ) as Signal<T>;
}

export function asyncComputed<T>(
  compute: (prev: T | undefined) => Promise<T>,
  opts?: SignalOptions<T>
): Signal<AsyncResult<T>>;
export function asyncComputed<T>(
  compute: (prev: T | undefined) => Promise<T>,
  opts: SignalOptionsWithInit<T>
): Signal<AsyncReady<T>>;
export function asyncComputed<T>(
  compute: (prev: T | undefined) => Promise<T>,
  opts?: Partial<SignalOptionsWithInit<T>>
): Signal<AsyncResult<T>> {
  return new ComputedSignal(
    SignalType.Async,
    compute,
    opts?.equals,
    opts?.initValue
  ) as Signal<AsyncResult<T>>;
}

export function subscription<T>(
  subscribe: SignalSubscribe<T>,
  opts?: SignalOptions<T>
): Signal<T | undefined>;
export function subscription<T>(
  subscribe: SignalSubscribe<T>,
  opts: SignalOptionsWithInit<T>
): Signal<T>;
export function subscription<T>(
  subscribe: SignalSubscribe<T>,
  opts?: Partial<SignalOptionsWithInit<T>>
): Signal<T> {
  return new ComputedSignal(
    SignalType.Subscription,
    subscribe,
    opts?.equals,
    opts?.initValue
  ) as Signal<T>;
}

export interface Watcher {
  disconnect(): void;
}

export function watcher(fn: () => void): Watcher {
  const watcher = new ComputedSignal(SignalType.Watcher, fn);

  scheduleWatcher(watcher);

  return {
    disconnect() {
      scheduleDisconnect(watcher);
    },
  };
}

export function untrack<T = void>(fn: () => T): T {
  const prevConsumer = CURRENT_CONSUMER;
  const prevConsumed = CURRENT_CONSUMED;
  const prevLastConsumed = LAST_CONSUMED;
  const prevOrd = CURRENT_ORD;
  const prevIsWatched = CURRENT_IS_WATCHED;

  try {
    CURRENT_CONSUMER = undefined;
    LAST_CONSUMED = undefined;
    CURRENT_CONSUMED = undefined;
    CURRENT_ORD = 0;
    CURRENT_IS_WATCHED = false;

    return fn();
  } finally {
    CURRENT_CONSUMER = prevConsumer;
    LAST_CONSUMED = prevLastConsumed;
    CURRENT_CONSUMED = prevConsumed;
    CURRENT_ORD = prevOrd;
    CURRENT_IS_WATCHED = prevIsWatched;
  }
}
