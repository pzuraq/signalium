import {
  type AsyncTask,
  type AsyncReady,
  type AsyncResult,
  type SignalOptions,
  type SignalOptionsWithInit,
  Watcher,
  WriteableSignal,
  SignalSubscribe,
} from './types.js';
import { hashValue } from './utils.js';
import { useSignalValue } from './config.js';
import { createComputedSignal, SignalType } from './signals/base.js';
import { getCurrentScope, ROOT_SCOPE, SignalScope } from './signals/contexts.js';
import { addListener } from './signals/watcher.js';
import { createStateSignal } from './signals/state.js';

export const state = <T>(value: T, opts?: Partial<SignalOptions<T, unknown[]>>): WriteableSignal<T> => {
  const signal = createStateSignal(value, opts);

  return {
    set(v: T) {
      signal.set(v);
    },

    get() {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSignalValue(signal._desc, () => signal.get());
    },
  };
};

const getParamsKey = (fn: (...args: any[]) => unknown, args: unknown[], opts?: Partial<SignalOptions<any, any[]>>) => {
  return hashValue([fn, opts?.paramKey?.(...args) ?? args]);
};

export function computed<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts?: Partial<SignalOptions<T, Args>>,
): (...args: Args) => T {
  return (...args) => {
    const key = getParamsKey(fn, args, opts);

    return useSignalValue(key, () => {
      const scope = getCurrentScope();
      return scope.get(
        SignalType.Computed,
        fn,
        key,
        args,
        opts as Partial<SignalOptionsWithInit<unknown, unknown[]>>,
      ) as T;
    });
  };
}

export type AsyncAwaitableResult<T> = T | Promise<T>;

export function asyncComputed<T, Args extends unknown[]>(
  fn: (...args: Args) => T | Promise<T>,
  opts?: SignalOptions<T, Args>,
): (...args: Args) => AsyncResult<T>;
export function asyncComputed<T, Args extends unknown[]>(
  fn: (...args: Args) => T | Promise<T>,
  opts: SignalOptionsWithInit<T, Args>,
): (...args: Args) => AsyncReady<T>;
export function asyncComputed<T, Args extends unknown[]>(
  fn: (...args: Args) => T | Promise<T>,
  opts?: Partial<SignalOptionsWithInit<T, Args>>,
): (...args: Args) => AsyncResult<T> | AsyncReady<T> {
  return (...args) => {
    const key = getParamsKey(fn, args, opts);

    return useSignalValue(key, () => {
      const scope = getCurrentScope();
      return scope.get(
        SignalType.AsyncComputed,
        fn,
        key,
        args,
        opts as Partial<SignalOptionsWithInit<unknown, unknown[]>>,
      ) as AsyncResult<T>;
    });
  };
}

export function subscription<T, Args extends unknown[]>(
  fn: SignalSubscribe<T, Args>,
  opts?: Partial<SignalOptionsWithInit<T, Args>>,
): (...args: Args) => T {
  return (...args) => {
    const key = getParamsKey(fn, args, opts);

    return useSignalValue(key, () => {
      const scope = getCurrentScope();
      return scope.get(
        SignalType.Subscription,
        fn,
        key,
        args,
        opts as Partial<SignalOptionsWithInit<unknown, unknown[]>>,
      ) as T;
    });
  };
}

export const asyncTask = <T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  opts?: Partial<SignalOptionsWithInit<T, Args>>,
): (<BuildArgs extends unknown[], RunArgs extends Args extends [...BuildArgs, ...infer _Rest] ? _Rest : Args>(
  ...args: Args extends [...BuildArgs, ...infer _Rest] ? BuildArgs : Args
) => AsyncTask<T, RunArgs>) => {
  return (...args) => {
    const key = getParamsKey(fn, args, opts);

    return useSignalValue(key, () => {
      const scope = getCurrentScope();
      return scope.get(
        SignalType.AsyncTask,
        fn,
        key,
        args,
        opts as Partial<SignalOptionsWithInit<unknown, unknown[]>>,
      ) as AsyncTask<T>;
    });
  };
};

export function watcher<T>(fn: () => T, opts?: SignalOptions<T, unknown[]> & { scope?: SignalScope }): Watcher<T> {
  const scope = opts?.scope ?? ROOT_SCOPE;

  const key = hashValue(fn);

  const w = createComputedSignal(SignalType.Watcher, key, fn, [], scope, opts);

  return {
    addListener: (listener, opts) => {
      return addListener(w, listener, opts);
    },
  };
}
