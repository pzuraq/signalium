import {
  BaseReactivePromise,
  ReactiveSubscription,
  ReactiveTask,
  ReactivePromise as IReactivePromise,
  SignalSubscribe,
  SignalSubscription,
  SubscriptionOptionsWithInit,
  DerivedSignalOptionsWithInit,
} from '../types.js';
import { createDerivedSignal, DerivedSignal, SignalState } from './derived.js';
import { CURRENT_CONSUMER, generatorResultToPromise, getSignal } from './get.js';
import { dirtySignal, dirtySignalConsumers } from './dirty.js';
import { scheduleAsyncPull } from './scheduling.js';
import { createEdge, EdgeType, findAndRemoveDirty, PromiseEdge } from './edge.js';
import { SignalScope, withScope } from './contexts.js';
import { createStateSignal } from './state.js';
import { isGeneratorResult, isPromise } from './utils/type-utils.js';
import { createShouldUpdate, ShouldUpdate } from './utils/should-update.js';
import { hydrate, ReifiedPersistConfig, reifyPersistConfig } from './persistence.js';

const enum AsyncFlags {
  // ======= Notifiers ========

  Pending = 1,
  Rejected = 1 << 1,
  Resolved = 1 << 2,
  Ready = 1 << 3,

  Value = 1 << 4,
  Error = 1 << 5,

  // ======= Properties ========

  isRunnable = 1 << 6,
  isSubscription = 1 << 7,

  // ======= Helpers ========

  Settled = Resolved | Rejected,
}

interface PendingResolve<T> {
  ref: WeakRef<DerivedSignal<unknown, unknown[]>> | undefined;
  edge: PromiseEdge | undefined;
  resolve: ((value: T) => void) | undefined | null;
  reject: ((error: unknown) => void) | undefined | null;
}

type TaskFn<T, Args extends unknown[]> = (...args: Args) => Promise<T>;

export class ReactivePromise<T, Args extends unknown[] = unknown[]> implements BaseReactivePromise<T> {
  private _value: T | undefined = undefined;

  private _error: unknown | undefined = undefined;
  private _flags = 0;

  private _signal: DerivedSignal<any, any> | TaskFn<T, Args> | undefined = undefined;
  private _shouldUpdate!: ShouldUpdate<T>;
  private _promise: Promise<T> | undefined;

  private _pending: PendingResolve<T>[] = [];

  private _stateSubs = new Map<WeakRef<DerivedSignal<unknown, unknown[]>>, number>();
  private _awaitSubs = new Map<WeakRef<DerivedSignal<unknown, unknown[]>>, PromiseEdge>();

  // Version is not really needed in a pure signal world, but when integrating
  // with non-signal code, it's sometimes needed to entangle changes to the promise.
  // For example, in React we need to entangle each promise immediately after it
  // was used because we can't dynamically call hooks.
  private _version = createStateSignal(0);

  static createPromise<T>(promise: Promise<T>, signal: DerivedSignal<T, unknown[]>, initValue?: T | undefined) {
    const p = new ReactivePromise<T>();

    p._signal = signal;
    p._shouldUpdate = signal.shouldUpdate as ShouldUpdate<T>;

    p._initFlags(AsyncFlags.Pending, initValue);

    if (promise) {
      p._setPromise(promise);
    }

    return p;
  }

  static createSubscription<T>(
    subscribe: SignalSubscribe<T>,
    scope: SignalScope,
    { initValue, equals, persist: persistConfig, ...opts }: Partial<SubscriptionOptionsWithInit<T>> = {},
  ) {
    const p = new ReactivePromise<T>();

    const state = {
      get: () => p._value as T,

      set: (value: T | Promise<T>) => {
        if (value !== null && typeof value === 'object' && isPromise(value)) {
          p._setPromise(value);
        } else {
          p._setValue(value as T);
        }
      },

      setError: (error: unknown) => {
        p._setError(error);
      },
    };

    let value = initValue;
    let initFlags = AsyncFlags.isSubscription | AsyncFlags.Pending;
    let reifiedPersistConfig: ReifiedPersistConfig<Awaited<T>, []> | undefined;

    if (persistConfig) {
      reifiedPersistConfig = reifyPersistConfig(persistConfig, [], undefined);

      if (reifiedPersistConfig.hydrate) {
        value = hydrate(reifiedPersistConfig) as Awaited<T>;
      }
    }

    let active = false;
    let currentSub: SignalSubscription | (() => void) | undefined | void;

    const unsubscribe = () => {
      if (typeof currentSub === 'function') {
        currentSub();
      } else if (currentSub !== undefined) {
        currentSub.unsubscribe?.();
      }

      const signal = p._signal as DerivedSignal<any, any>;

      // Reset the signal state, preparing it for next activation
      signal.subs = new Map();
      signal._state = SignalState.Dirty;
      signal.watchCount = 0;
      active = false;
      currentSub = undefined;
    };

    p._signal = createDerivedSignal(
      () => {
        if (active === false) {
          currentSub = subscribe(state);
          active = true;
        } else if (typeof currentSub === 'function' || currentSub === undefined) {
          currentSub?.();
          currentSub = subscribe(state);
        } else {
          currentSub.update?.();
        }

        return unsubscribe;
      },
      [],
      undefined,
      undefined,
      scope,
      opts,
      true,
    );

    p._shouldUpdate = createShouldUpdate(equals, reifiedPersistConfig) as ShouldUpdate<T>;
    p._initFlags(initFlags, value as T);

    return p;
  }

  /**
   * Creates a ReactivePromise from a persisted value
   * The created promise will be in a resolved, ready state
   */
  static createFromPersisted<T>(value: Awaited<T>, signal: DerivedSignal<any, any[]>) {
    const p = new ReactivePromise<T>();

    p._signal = signal;
    p._shouldUpdate = signal.shouldUpdate as ShouldUpdate<T>;

    // Initialize with Ready and Resolved flags
    p._initFlags(AsyncFlags.Resolved | AsyncFlags.Ready, value);

    return p;
  }

  static createTask<T, Args extends unknown[]>(
    task: (...args: Args) => Promise<T>,
    scope: SignalScope,
    opts?: Partial<DerivedSignalOptionsWithInit<T, Args>>,
  ): ReactiveTask<T, Args> {
    const p = new ReactivePromise<T, Args>();
    const initValue = opts?.initValue;

    p._signal = (...args) => {
      return withScope(scope, () => {
        const result = task(...args);

        return typeof result === 'object' && result !== null && isGeneratorResult(result)
          ? generatorResultToPromise(result, undefined)
          : result;
      });
    };

    p._shouldUpdate = createShouldUpdate(opts?.equals) as ShouldUpdate<T>;
    p._initFlags(AsyncFlags.isRunnable, initValue as T);

    return p as ReactiveTask<T, Args>;
  }

  private _initFlags(baseFlags: number, initValue?: T) {
    let flags = baseFlags;

    if (initValue !== undefined) {
      flags |= AsyncFlags.Ready;
    }

    this._flags = flags;
    this._value = initValue as T;
  }

  private _consumeFlags(flags: number) {
    if (CURRENT_CONSUMER === undefined) return;

    if ((this._flags & AsyncFlags.isSubscription) !== 0) {
      this._connect();
    }

    const ref = CURRENT_CONSUMER.ref;

    const subs = this._stateSubs;

    const subbedFlags = subs.get(ref) ?? 0;
    subs.set(ref, subbedFlags | flags);
  }

  private _connect() {
    const signal = this._signal as DerivedSignal<any, any>;

    if (CURRENT_CONSUMER?.watchCount === 0) {
      const { ref, computedCount, deps } = CURRENT_CONSUMER!;
      const prevEdge = deps.get(signal);

      if (prevEdge?.consumedAt !== computedCount) {
        const newEdge = createEdge(prevEdge, EdgeType.Signal, signal, signal.updatedCount, computedCount);

        signal.subs.set(ref, newEdge);
        deps.set(signal, newEdge);
      }
    } else {
      getSignal(signal);
    }
  }

  private _setFlags(setTrue: number, setFalse = 0, notify = 0) {
    const prevFlags = this._flags;

    const nextFlags = (prevFlags & ~setFalse) | setTrue;
    const allChanged = (prevFlags ^ nextFlags) | notify;

    this._flags = nextFlags;

    if (allChanged === 0) {
      return;
    }

    const subs = this._stateSubs;

    for (const [signalRef, subbedFlags] of subs) {
      if ((subbedFlags & allChanged) !== 0) {
        const signal = signalRef.deref();

        if (signal) {
          dirtySignal(signal);
        }

        subs.delete(signalRef);
      }
    }

    this._version.update(v => v + 1);
  }

  _setPending() {
    this._setFlags(AsyncFlags.Pending);
  }

  async _setPromise(promise: Promise<T>) {
    // Store the current promise so we can check if it's the same promise in the
    // then handlers. If it's not the same promise, it means that the promise has
    // been recomputed and replaced, so we should not update state.
    this._promise = promise;

    const flags = this._flags;
    let awaitSubs = this._awaitSubs;

    // If we were not already pending, we need to propagate the dirty state to any
    // consumers that were added since the promise was resolved last.
    if ((flags & AsyncFlags.Pending) === 0) {
      this._setPending();
      dirtySignalConsumers(awaitSubs);
      this._awaitSubs = awaitSubs = new Map();
    }

    try {
      const nextValue = await promise;

      if (promise !== this._promise) {
        return;
      }

      this._setValue(nextValue, awaitSubs);
    } catch (nextError) {
      if (promise !== this._promise) {
        return;
      }

      this._setError(nextError, awaitSubs);
    }
  }

  private _setValue(nextValue: T, awaitSubs = this._awaitSubs) {
    let flags = this._flags;
    let value = this._value;

    let notifyFlags = 0;

    if (this._shouldUpdate((flags & AsyncFlags.Ready) !== 0, value!, nextValue)) {
      this._value = value = nextValue;
      notifyFlags = AsyncFlags.Value;
    }

    if (flags & AsyncFlags.Rejected) {
      notifyFlags = AsyncFlags.Error;
      this._error = undefined;
    }

    this._scheduleSubs(awaitSubs, notifyFlags !== 0);

    this._setFlags(AsyncFlags.Resolved | AsyncFlags.Ready, AsyncFlags.Pending | AsyncFlags.Rejected, notifyFlags);

    for (const { ref, edge, resolve } of this._pending) {
      resolve?.(value!);

      if (ref !== undefined) {
        awaitSubs.set(ref, edge!);
      }
    }

    this._pending = [];
  }

  private _setError(nextError: unknown, awaitSubs = this._awaitSubs) {
    let error = this._error;

    let notifyFlags = 0;

    if (error !== nextError) {
      this._error = error = nextError;
      notifyFlags = AsyncFlags.Error;
    }

    this._scheduleSubs(awaitSubs, notifyFlags !== 0);

    this._setFlags(AsyncFlags.Rejected, AsyncFlags.Pending | AsyncFlags.Resolved, notifyFlags);

    for (const { ref, edge, reject } of this._pending) {
      reject?.(error);

      if (ref !== undefined) {
        awaitSubs.set(ref, edge!);
      }
    }

    this._pending = [];
  }

  private _scheduleSubs(awaitSubs: Map<WeakRef<DerivedSignal<unknown, unknown[]>>, PromiseEdge>, dirty: boolean) {
    // Await subscribers that have been added since the promise was set are specifically
    // subscribers that were previously notified and MaybeDirty, were removed from the
    // signal, and then were checked (e.g. checkSignal was called on them) and they
    // halted and added themselves back as dependencies.
    //
    // If the value actually changed, then these consumers are Dirty and will notify and
    // schedule themselves the standard way here. If the value did not change, then the
    // consumers are not notified and end up back in the same state as before the promise
    // was set (because nothing changed), and instead they will be scheduled to continue
    // the computation from where they left off.
    const newState = dirty ? SignalState.Dirty : SignalState.MaybeDirty;

    for (const ref of awaitSubs.keys()) {
      const signal = ref.deref();

      if (signal === undefined) {
        continue;
      }

      signal._state = newState;

      scheduleAsyncPull(signal);
    }
  }

  get value() {
    this._consumeFlags(AsyncFlags.Value);

    return this._value;
  }

  get error() {
    this._consumeFlags(AsyncFlags.Error);

    return this._error;
  }

  get isPending() {
    this._consumeFlags(AsyncFlags.Pending);

    return (this._flags & AsyncFlags.Pending) !== 0;
  }

  get isRejected() {
    this._consumeFlags(AsyncFlags.Rejected);

    return (this._flags & AsyncFlags.Rejected) !== 0;
  }

  get isResolved() {
    this._consumeFlags(AsyncFlags.Resolved);

    return (this._flags & AsyncFlags.Resolved) !== 0;
  }

  get isReady() {
    this._consumeFlags(AsyncFlags.Ready);

    return (this._flags & AsyncFlags.Ready) !== 0;
  }

  get isSettled() {
    this._consumeFlags(AsyncFlags.Settled);

    return (this._flags & AsyncFlags.Settled) !== 0;
  }

  // Aliases for backwards compatibility (TODO: Figure out how to do this better)
  get data() {
    return this.value;
  }

  get isFetching() {
    return this.isPending;
  }

  get isSuccess() {
    return this.isResolved;
  }

  get isError() {
    return this.isRejected;
  }

  get isFetched() {
    return this.isSettled;
  }

  _run(...args: Args) {
    const flags = this._flags;
    const signal = this._signal;

    if ((flags & AsyncFlags.isRunnable) !== 0) {
      this._setPromise((signal as TaskFn<T, Args>)(...args));
    } else if (signal) {
      dirtySignal(signal as DerivedSignal<any, any>);
    } else {
      throw new Error(
        'ReactivePromise is not runnable. If you are using run() on a ReactivePromise, make sure you used `task` to create this promise. If you are using rerun(), make sure its a promise that was generated by a reactive async function.',
      );
    }

    return this;
  }

  run = this._run.bind(this);

  get rerun() {
    return this.run as () => ReactivePromise<T, Args>;
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const flags = this._flags;

    // Create a new Promise that will be returned
    return new Promise<TResult1 | TResult2>((resolve, reject) => {
      let ref, edge;

      if (CURRENT_CONSUMER !== undefined) {
        if ((flags & AsyncFlags.isSubscription) !== 0) {
          this._connect();
        }

        ref = CURRENT_CONSUMER.ref;

        const prevEdge =
          this._awaitSubs.get(ref!) ?? findAndRemoveDirty(CURRENT_CONSUMER, this as ReactivePromise<any>);

        edge = createEdge(prevEdge, EdgeType.Promise, this as ReactivePromise<any>, -1, CURRENT_CONSUMER.computedCount);
      }
      // Create wrapper functions that will call the original callbacks and then resolve/reject the new Promise
      const wrappedFulfilled = onfulfilled
        ? (value: T) => {
            try {
              const result = onfulfilled(value);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          }
        : (resolve as unknown as (value: T) => void);

      const wrappedRejected = onrejected
        ? (reason: unknown) => {
            try {
              const result = onrejected(reason);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          }
        : reject;

      if (flags & AsyncFlags.Pending) {
        this._pending.push({ ref, edge, resolve: wrappedFulfilled, reject: wrappedRejected });
      } else {
        if (flags & AsyncFlags.Resolved) {
          wrappedFulfilled(this._value!);
        } else if (flags & AsyncFlags.Rejected) {
          wrappedRejected(this._error);
        }

        if (ref) {
          this._awaitSubs.set(ref, edge!);
        }
      }
    });
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T | TResult> {
    return this.then(null, onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    return this.then(
      value => {
        onfinally?.();
        return value;
      },
      reason => {
        onfinally?.();
        throw reason;
      },
    );
  }

  get [Symbol.toStringTag](): string {
    return 'ReactivePromise';
  }
}

export function isReactivePromise(obj: unknown): obj is IReactivePromise<unknown> {
  return obj instanceof ReactivePromise && (obj['_flags'] & (AsyncFlags.isSubscription & AsyncFlags.isRunnable)) === 0;
}

export function isReactiveTask(obj: unknown): obj is ReactiveTask<unknown, unknown[]> {
  return obj instanceof ReactivePromise && (obj['_flags'] & AsyncFlags.isRunnable) !== 0;
}

export function isReactiveSubscription<T, Args extends unknown[]>(obj: unknown): obj is ReactiveSubscription<T> {
  return obj instanceof ReactivePromise && (obj['_flags'] & AsyncFlags.isSubscription) !== 0;
}
