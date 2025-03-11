export { createStateSignal } from './internals/state.js';

import { createDerivedSignal, SignalType } from './internals/base.js';
import {
  AsyncReady,
  AsyncResult,
  Signal,
  SignalOptions,
  SignalOptionsWithInit,
  SignalSubscription,
  SubscriptionState,
  Watcher,
} from './types.js';

export const createComputedSignal = <T>(compute: () => T, opts?: Partial<SignalOptions<T, unknown[]>>): Signal<T> => {
  return createDerivedSignal(SignalType.Computed, compute, [], undefined, undefined, opts);
};

export function createAsyncComputedSignal<T>(
  fn: () => T | Promise<T>,
  opts?: SignalOptions<T, never[]>,
): Signal<AsyncResult<T>>;
export function createAsyncComputedSignal<T>(
  fn: () => T | Promise<T>,
  opts: SignalOptionsWithInit<T, never[]>,
): Signal<AsyncReady<T>>;
export function createAsyncComputedSignal<T>(
  fn: () => T | Promise<T>,
  opts?: Partial<SignalOptionsWithInit<T, never[]>>,
): Signal<AsyncResult<T> | AsyncReady<T>> {
  return createDerivedSignal(SignalType.AsyncComputed, fn, [], undefined, undefined, opts);
}

export function createSubscriptionSignal<T>(
  fn: (state: SubscriptionState<T>, ...args: unknown[]) => SignalSubscription | (() => unknown) | undefined,
  opts?: Partial<SignalOptionsWithInit<T, never[]>>,
): Signal<T> {
  return createDerivedSignal(SignalType.Subscription, fn, [], undefined, undefined, opts);
}

export function createAsyncTaskSignal<T>(
  fn: (...args: unknown[]) => Promise<T>,
  opts?: Partial<SignalOptionsWithInit<T, never[]>>,
): Signal<T> {
  return createDerivedSignal(SignalType.AsyncTask, fn, [], undefined, undefined, opts);
}

export function createWatcherSignal<T>(fn: () => T, opts?: Partial<SignalOptionsWithInit<T, never[]>>): Watcher<T> {
  return createDerivedSignal(SignalType.Watcher, fn, [], undefined, undefined, opts);
}
