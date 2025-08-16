/* eslint-disable react-hooks/rules-of-hooks */
import { useCallback, useSyncExternalStore } from 'react';
import {
  ReactiveSubscription as IReactiveSubscription,
  ReactivePromise as IReactivePromise,
  ReactiveValue,
  StateSignal,
} from '../types.js';
import { getCurrentScope } from '../internals/contexts.js';
import { DERIVED_DEFINITION_MAP } from '../hooks.js';
import { expect } from '../type-utils.js';
import { isReactiveSubscription } from '../internals/async.js';
import { CURRENT_CONSUMER } from '../internals/consumer.js';
import { DerivedSignal } from '../internals/derived.js';
import { isReactivePromiseInstance } from '../internals/utils/type-utils.js';
import { ReactivePromise } from '../internals/async.js';

const useStateSignal = <T>(signal: StateSignal<T>): T => {
  return useSyncExternalStore(
    useCallback(onStoreChange => signal.addListener(onStoreChange), [signal]),
    () => signal.peek(),
    () => signal.peek(),
  );
};

const useDerivedSignal = <R, Args extends unknown[]>(signal: DerivedSignal<R, Args>): ReactiveValue<R> => {
  return useSyncExternalStore(
    signal.addListenerLazy(),
    () => signal.get(),
    () => signal.get(),
  );
};

const useReactivePromise = <R>(promise: ReactivePromise<R>): ReactivePromise<R> => {
  if (isReactiveSubscription(promise)) {
    useDerivedSignal(promise['_signal'] as DerivedSignal<any, unknown[]>);
  }

  useStateSignal(promise['_version']);

  return promise;
};

const useReactiveFn = <R, Args extends readonly Narrowable[]>(fn: (...args: Args) => R, ...args: Args): R => {
  const def = expect(DERIVED_DEFINITION_MAP.get(fn), 'Expected to find a derived definition for the function');

  const scope = getCurrentScope();
  const signal = scope.get(def, args);

  if (CURRENT_CONSUMER) {
    return signal.get();
  }

  const value = useDerivedSignal(signal);

  // Reactive promises can update their value independently of the signal, since
  // we reuse the same promise object for each result. We need to entangle the
  // version of the promise here so that we can trigger a re-render when the
  // promise value updates.
  //
  // If hooks could be called in dynamic order this would not be necessary, we
  // could entangle the promise when it is used. But, because that is not the
  // case, we need to eagerly entangle.
  if (typeof value === 'object' && value !== null && isReactivePromiseInstance(value)) {
    return useReactivePromise(value) as R;
  }

  return value;
};

const isNonNullishReactivePromiseInstance = (value: unknown): value is ReactivePromise<unknown> => {
  return typeof value === 'object' && value !== null && isReactivePromiseInstance(value);
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type Narrowable = string | number | boolean | null | undefined | bigint | symbol | {};

export function useReactive<R>(signal: StateSignal<R>): R;
export function useReactive<R>(signal: IReactiveSubscription<R>): IReactiveSubscription<R>;
export function useReactive<R>(signal: IReactivePromise<R>): IReactivePromise<R>;
export function useReactive<R, Args extends readonly Narrowable[]>(fn: (...args: Args) => R, ...args: Args): R;
export function useReactive<R, Args extends readonly Narrowable[]>(
  signal: StateSignal<R> | IReactiveSubscription<R> | IReactivePromise<R> | ((...args: Args) => R),
  ...args: Args
): R | IReactivePromise<R> | IReactiveSubscription<R> {
  if (CURRENT_CONSUMER) {
    if (typeof signal === 'function') {
      return signal(...args);
    } else if (isNonNullishReactivePromiseInstance(signal)) {
      return signal as IReactivePromise<R>;
    } else {
      return (signal as StateSignal<R>).get() as R;
    }
  }

  if (typeof signal === 'function') {
    return useReactiveFn(signal, ...args);
  } else if (typeof signal === 'object' && signal !== null && isReactivePromiseInstance(signal)) {
    return useReactivePromise(signal) as IReactivePromise<R>;
  } else {
    return useStateSignal(signal as StateSignal<R>);
  }
}
