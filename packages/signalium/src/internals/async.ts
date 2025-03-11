import { state } from '../hooks.js';
import { scheduleDirty } from './scheduling.js';
import { TRACER, TracerEventType } from '../trace.js';
import { AsyncBaseResult, AsyncResult, AsyncTask } from '../types.js';
import { AsyncComputedSignal, AsyncTaskSignal, DerivedSignal, SignalType } from './base.js';
import { STATE_CLOCK } from './clock.js';
import { CURRENT_CONSUMER, setCurrentConsumer } from './consumer.js';
import { dirtySignal } from './dirty.js';
import { createStateSignal } from './state.js';

let CURRENT_IS_WAITING: boolean = false;
const WAITING = Symbol();

const enum AsyncFlags {
  Pending = 1,
  Error = 1 << 1,
  Success = 1 << 2,
  Ready = 1 << 3,
  Resolved = 1 << 4,
}

export class AsyncValue<T, Args extends unknown[]> {
  public _result = createStateSignal<T | undefined>(undefined);
  public _error = createStateSignal<unknown>(undefined);
  public _flags = createStateSignal<number>(0);

  private _resolves: ((value: T) => void)[] = [];
  private _rejects: ((reason: unknown) => void)[] = [];

  constructor(
    public _signal: RelaySignal<T, Args>,
    initValue?: T | undefined,
  ) {
    this._result.set(initValue);

    this._flags.set(initValue !== undefined ? AsyncFlags.Ready : 0);
  }

  get result() {
    return this._result.get();
  }

  get error() {
    return this._error.get();
  }

  get isPending() {
    return (this._flags.get() & AsyncFlags.Pending) !== 0;
  }

  get isError() {
    return (this._flags.get() & AsyncFlags.Error) !== 0;
  }

  get isSuccess() {
    return (this._flags.get() & AsyncFlags.Success) !== 0;
  }

  get isReady() {
    return (this._flags.get() & AsyncFlags.Ready) !== 0;
  }

  get didResolve() {
    return (this._flags.get() & AsyncFlags.Resolved) !== 0;
  }

  setPending() {
    this._flags.update(flags => (flags & ~AsyncFlags.Success & ~AsyncFlags.Error) | AsyncFlags.Pending);
  }

  setSuccess(value: T) {
    this._flags.update(
      flags => (flags & ~AsyncFlags.Pending) | AsyncFlags.Success | AsyncFlags.Resolved | AsyncFlags.Ready,
    );
    this._result.set(value);
    this._resolves.forEach(resolve => resolve(value));
    this._resolves = [];
  }

  setError(error: unknown) {
    this._flags.update(flags => (flags & ~AsyncFlags.Pending) | AsyncFlags.Error | AsyncFlags.Resolved);
    this._error.set(error);
    this._rejects.forEach(reject => reject(error));
    this._rejects = [];
  }

  invalidate() {
    const { _signal: signal } = this;
    signal.dirtyState = true;
    dirtySignal(signal);
  }

  then(onfulfilled: (value: T) => void, onrejected: (reason: unknown) => void) {
    const flags = this._flags._value;

    if (flags & AsyncFlags.Pending) {
      this._resolves.push(onfulfilled);
      this._rejects.push(onrejected);
    } else if (flags & AsyncFlags.Success) {
      onfulfilled?.(this.result!);
    } else if (flags & AsyncFlags.Error) {
      onrejected?.(this.error);
    }
  }
}

export const capture = (): [<T>(v: T) => T, <T>(v: T) => T] => {
  const currentConsumer = CURRENT_CONSUMER;

  let prevConsumer: DerivedSignal<unknown, unknown[]> | undefined;

  return [
    v => {
      prevConsumer = CURRENT_CONSUMER;
      setCurrentConsumer(currentConsumer);
      return v;
    },
    v => {
      setCurrentConsumer(prevConsumer);
      return v;
    },
  ];
};

const continuation = <T>(promise: Promise<T>): PromiseLike<T> => {
  const currentConsumer = CURRENT_CONSUMER;

  return {
    then(onfulfilled, onrejected) {
      return promise.then(
        value => {
          setCurrentConsumer(currentConsumer);

          return onfulfilled?.(value);
        },
        reason => {
          setCurrentConsumer(currentConsumer);

          return onrejected?.(reason);
        },
      );
    },
  };
};

const runRelay = <T, Args extends unknown[]>(relay: Relay<T, Args, unknown[], unknown[]>, ...args: Args) => {
  let nextValue;

  try {
    nextValue = signal.compute(...signal.args, ...args);
  } catch (e) {
    relay._error.set(e);
    relay._flags.update(flags => (flags & ~AsyncFlags.Pending) | AsyncFlags.Error);

    // if (shouldRethrow) {
    //   throw e;
    // }
  }

  if (nextValue instanceof Promise) {
    nextValue.catch(e => {
      relay._error.set(e);
      relay._flags.update(flags => (flags & ~AsyncFlags.Pending) | AsyncFlags.Error);
    });
  }

  if (CURRENT_IS_WAITING) {
    if ((this._currentFlags & AsyncFlags.Pending) === 0) {
      this._currentFlags = (this._currentFlags & ~(AsyncFlags.Error | AsyncFlags.Success)) | AsyncFlags.Pending;

      this._flags.set(this._currentFlags);
      signal.updatedAt = STATE_CLOCK;
    }

    if (nextValue instanceof Promise) {
      nextValue.catch((e: unknown) => {
        if (e !== WAITING) {
          this._error.set(e);

          this._currentFlags = (this._currentFlags & ~AsyncFlags.Pending) | AsyncFlags.Error;

          this._flags.set(this._currentFlags);

          if (shouldRethrow) {
            throw e;
          }
        }
      });

      return nextValue;
    }

    return Promise.resolve(nextValue!);
  } else if (nextValue instanceof Promise) {
    const startedAt = (signal.updatedAt = STATE_CLOCK);

    TRACER?.emit({
      type: TracerEventType.StartLoading,
      id: signal.tracerMeta!.id,
    });

    nextValue = nextValue
      .then(
        result => {
          if (startedAt !== signal.updatedAt) {
            return;
          }

          this._result.set(result);

          this._currentFlags =
            (this._currentFlags & ~AsyncFlags.Pending) | AsyncFlags.Resolved | AsyncFlags.Success | AsyncFlags.Ready;

          this._flags.set(this._currentFlags);

          return result;
        },
        error => {
          if (startedAt !== signal.updatedAt || error === WAITING) {
            return;
          }

          this._error.set(error);

          this._currentFlags = (this._currentFlags & ~(AsyncFlags.Pending | AsyncFlags.Success)) | AsyncFlags.Error;

          this._flags.set(this._currentFlags);
          scheduleDirty(signal);

          if (shouldRethrow) {
            throw error;
          }
        },
      )
      .finally(() => {
        TRACER?.emit({
          type: TracerEventType.EndLoading,
          id: signal.tracerMeta!.id,
          value: this,
        });
      }) as Promise<T>;

    this._currentFlags = (this._currentFlags & ~(AsyncFlags.Error | AsyncFlags.Success)) | AsyncFlags.Pending;

    this._flags.set(this._currentFlags);

    return nextValue;
  } else {
    signal.updatedAt = STATE_CLOCK;

    this._result.set(nextValue);
    this._currentFlags =
      (this._currentFlags & ~AsyncFlags.Pending) | AsyncFlags.Resolved | AsyncFlags.Success | AsyncFlags.Ready;

    this._flags.set(this._currentFlags);

    TRACER?.emit({
      type: TracerEventType.EndLoading,
      id: signal.tracerMeta!.id,
      value: this,
    });

    return Promise.resolve(nextValue!);
  }
};

export const createAsyncTask = <T, CreateArgs extends unknown[], RunArgs extends unknown[]>(
  signal: AsyncTaskSignal<T, CreateArgs, RunArgs>,
  initValue: T | undefined,
): AsyncTask<T, RunArgs> => new AsyncValueImpl(signal, initValue);

export const createAsyncResult = <T, Args extends unknown[]>(
  signal: AsyncComputedSignal<T, Args>,
  initValue: T | undefined,
): AsyncResult<T> => new AsyncValueImpl(signal, initValue) as AsyncResult<T>;
