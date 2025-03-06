import { scheduleDirty, schedulePull } from '../scheduling.js';
import { TRACER, TracerEventType } from '../trace.js';
import { AsyncResult, AsyncTask } from '../types.js';
import { AsyncComputedSignal, AsyncTaskSignal, SignalType } from './base.js';
import { incrementStateClock, STATE_CLOCK } from './clock.js';
import { CURRENT_CONSUMER, setCurrentConsumer } from './consumer.js';
import { dirtySignal, dirtySignalConsumers } from './dirty.js';

let CURRENT_IS_WAITING: boolean = false;
const WAITING = Symbol();

export const createAsyncTask = <T, CreateArgs extends unknown[], RunArgs extends unknown[]>(
  signal: AsyncTaskSignal<T, CreateArgs, RunArgs>,
  initValue: T | undefined,
): AsyncTask<T> =>
  ({
    result: initValue,
    error: undefined,
    isReady: initValue !== undefined,

    isPending: false,
    isError: false,
    isSuccess: false,
    didResolve: false,

    run: async (...args: RunArgs) => {
      const prevConsumer = CURRENT_CONSUMER;
      const value = signal.currentValue;

      try {
        setCurrentConsumer(signal);

        const result = signal.compute(...signal.args, ...args);

        setCurrentConsumer(prevConsumer);

        if (!(result instanceof Promise)) {
          value.result = result;
          return value.result!;
        }

        value.isPending = true;
        value.isSuccess = false;
        value.isError = false;

        // Task should never be dirtied, but consumers need to be
        // to pull updated task state
        dirtySignalConsumers(signal, true);

        const startedAt = (signal.updatedAt = incrementStateClock());

        signal.state = result;
        const resultValue = await result;

        if (startedAt !== signal.updatedAt) {
          return value.result!;
        }

        value.result = resultValue;
        value.isReady = true;
        value.isPending = false;
        value.isSuccess = true;
        value.didResolve = true;

        signal.updatedAt = incrementStateClock();
        dirtySignalConsumers(signal, true);

        return value.result!;
      } catch (e) {
        value.error = e;
        value.isPending = false;
        value.isError = true;
        value.isSuccess = false;
        value.didResolve = true;

        throw e;
      }
    },

    await: () => {
      if (CURRENT_CONSUMER === undefined || CURRENT_CONSUMER.type !== SignalType.AsyncComputed) {
        throw new Error(
          'Cannot await an async signal outside of an async signal. If you are using an async function, you must use signal.await() for all async signals _before_ the first language-level `await` keyword statement (e.g. it must be synchronous).',
        );
      }

      TRACER?.emit({
        type: TracerEventType.StartLoading,
        id: CURRENT_CONSUMER.id,
      });

      const value = signal.currentValue;

      if (value.isPending) {
        const currentConsumer = CURRENT_CONSUMER;
        (signal.state as Promise<unknown>).finally(() => schedulePull(currentConsumer));

        CURRENT_IS_WAITING = true;
        throw WAITING;
      } else if (value.isError) {
        throw value.error;
      }

      return value.result as T;
    },
  }) as AsyncTask<T, unknown[]>;

export const createAsyncResult = <T, Args extends unknown[]>(
  signal: AsyncComputedSignal<T, Args>,
  initValue: T | undefined,
): AsyncResult<T> =>
  ({
    result: initValue,
    error: undefined,
    isReady: initValue !== undefined,

    isPending: true,
    isError: false,
    isSuccess: false,
    didResolve: false,

    invalidate: () => {
      signal.dirtyState = true;
      dirtySignal(signal);
    },

    await: () => {
      if (CURRENT_CONSUMER === undefined || CURRENT_CONSUMER.type !== SignalType.AsyncComputed) {
        throw new Error(
          'Cannot await an async signal outside of an async signal. If you are using an async function, you must use signal.await() for all async signals _before_ the first language-level `await` keyword statement (e.g. it must be synchronous).',
        );
      }

      TRACER?.emit({
        type: TracerEventType.StartLoading,
        id: CURRENT_CONSUMER.id,
      });

      const value = signal.currentValue;

      if (value.isPending) {
        const currentConsumer = CURRENT_CONSUMER;
        (signal.state as Promise<unknown>).finally(() => schedulePull(currentConsumer));

        CURRENT_IS_WAITING = true;
        throw WAITING;
      } else if (value.isError) {
        throw value.error;
      }

      return value.result as T;
    },
  }) as AsyncResult<T>;

export function runAsyncComputed<T, Args extends unknown[]>(signal: AsyncComputedSignal<T, Args>) {
  const value = signal.currentValue;

  let nextValue;

  try {
    CURRENT_IS_WAITING = false;
    nextValue = signal.compute(...signal.args);
  } catch (e) {
    if (e !== WAITING) {
      value.error = e;
      value.isPending = false;
      value.isError = true;
      signal.updatedAt = STATE_CLOCK;
      return;
    }
  }

  if (CURRENT_IS_WAITING) {
    if (!value.isPending) {
      value.isPending = true;
      value.isError = false;
      value.isSuccess = false;
      signal.updatedAt = STATE_CLOCK;
    }

    if (nextValue instanceof Promise) {
      nextValue.catch((e: unknown) => {
        if (e !== WAITING) {
          value.error = e;
          value.isPending = false;
          value.isError = true;
          signal.updatedAt = STATE_CLOCK;
        }
      });
    }
  } else if (nextValue instanceof Promise) {
    const startedAt = (signal.updatedAt = STATE_CLOCK);

    TRACER?.emit({
      type: TracerEventType.StartLoading,
      id: signal.id,
    });

    nextValue = nextValue
      .then(
        result => {
          if (startedAt !== signal.updatedAt) {
            return;
          }

          value.result = result;
          value.isReady = true;
          value.didResolve = true;

          value.isPending = false;
          value.isSuccess = true;

          signal.updatedAt = incrementStateClock();
          scheduleDirty(signal);
        },
        error => {
          if (startedAt !== signal.updatedAt || error === WAITING) {
            return;
          }

          value.error = error;
          value.isPending = false;
          value.isError = true;
          signal.updatedAt = incrementStateClock();
          scheduleDirty(signal);
        },
      )
      .finally(() => {
        TRACER?.emit({
          type: TracerEventType.EndLoading,
          id: signal.id,
          value: value,
        });
      });

    signal.state = nextValue;

    value.isPending = true;
    value.isError = false;
    value.isSuccess = false;
  } else {
    value.result = nextValue as T;
    value.isReady = true;
    value.isPending = false;
    value.isSuccess = true;
    value.isError = false;

    signal.updatedAt = STATE_CLOCK;

    TRACER?.emit({
      type: TracerEventType.EndLoading,
      id: signal.id,
      value: value,
    });
  }
}
