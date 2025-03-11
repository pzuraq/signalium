import { state } from '../hooks.js';
import { scheduleDirty } from './scheduling.js';
import { TRACER, TracerEventType } from '../trace.js';
import { AsyncBaseResult, AsyncResult, AsyncTask } from '../types.js';
import { AsyncComputedSignal, AsyncTaskSignal, SignalType } from './base.js';
import { STATE_CLOCK } from './clock.js';
import { CURRENT_CONSUMER } from './consumer.js';
import { dirtySignal } from './dirty.js';

let CURRENT_IS_WAITING: boolean = false;
const WAITING = Symbol();

const enum AsyncFlags {
  Pending = 1,
  Error = 1 << 1,
  Success = 1 << 2,
  Ready = 1 << 3,
  Resolved = 1 << 4,
}

export class AsyncValueImpl<T, Args extends unknown[], CreateArgs extends unknown[], RunArgs extends unknown[]>
  implements AsyncTask<T, RunArgs>, AsyncBaseResult<T>
{
  private _result = state<T | undefined>(undefined);
  private _error = state<unknown>(undefined);
  private _flags = state<number>(0);
  private _currentFlags = 0;

  constructor(
    private _signal: AsyncComputedSignal<T, Args> | AsyncTaskSignal<T, CreateArgs, RunArgs>,
    initValue?: T | undefined,
  ) {
    this._result.set(initValue);

    this._currentFlags = initValue !== undefined ? AsyncFlags.Ready : 0;

    this._flags.set(this._currentFlags);
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

  invalidate() {
    const { _signal: signal } = this;
    signal.dirtyState = true;
    dirtySignal(signal);
  }

  run(...args: unknown[]) {
    const { _signal: signal } = this;
    const shouldRethrow = signal.type === SignalType.AsyncTask;

    let nextValue;

    try {
      CURRENT_IS_WAITING = false;
      nextValue = signal.compute(...signal.args, ...args);
    } catch (e) {
      if (e !== WAITING) {
        this._error.set(e);

        this._currentFlags = (this._currentFlags & ~AsyncFlags.Pending) | AsyncFlags.Error;

        this._flags.set(this._currentFlags);

        if (shouldRethrow) {
          throw e;
        }
      }
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
  }

  await() {
    if (CURRENT_CONSUMER === undefined || CURRENT_CONSUMER.type !== SignalType.AsyncComputed) {
      throw new Error(
        'Cannot await an async signal outside of an async signal. If you are using an async function, you must use signal.await() for all async signals _before_ the first language-level `await` keyword statement (e.g. it must be synchronous).',
      );
    }

    TRACER?.emit({
      type: TracerEventType.StartLoading,
      id: CURRENT_CONSUMER.tracerMeta!.id,
    });

    if (this.isPending) {
      CURRENT_IS_WAITING = true;
      throw WAITING;
    } else if (this.isError) {
      throw this.error;
    }

    return this.result!;
  }
}

export const createAsyncTask = <T, CreateArgs extends unknown[], RunArgs extends unknown[]>(
  signal: AsyncTaskSignal<T, CreateArgs, RunArgs>,
  initValue: T | undefined,
): AsyncTask<T, RunArgs> => new AsyncValueImpl(signal, initValue);

export const createAsyncResult = <T, Args extends unknown[]>(
  signal: AsyncComputedSignal<T, Args>,
  initValue: T | undefined,
): AsyncResult<T> => new AsyncValueImpl(signal, initValue) as AsyncResult<T>;
