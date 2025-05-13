import {
  ReactiveTask,
  ReactiveValue,
  ReadyReactivePromise,
  ReadyReactiveValue,
  Signal,
  SignalOptions,
  SignalSubscribe,
  SignalSubscribeWithInit,
  type DerivedSignalOptions,
  type DerivedSignalOptionsWithInit,
  type SubscriptionOptions,
  type SubscriptionOptionsWithInit,
} from './types.js';
import { useDerivedSignal } from './config.js';
import { getCurrentScope, SignalScope } from './internals/contexts.js';
import { createStateSignal } from './internals/state.js';
import { createDerivedSignal } from './internals/derived.js';
import { ReactivePromise } from './internals/async.js';
import { Tracer } from './trace.js';

export const state = createStateSignal;

export function reactive<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts?: Partial<DerivedSignalOptions<T, Args>>,
): (...args: Args) => ReactiveValue<T>;
export function reactive<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts: DerivedSignalOptionsWithInit<T, Args>,
): (...args: Args) => ReadyReactiveValue<T>;
export function reactive<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts?: Partial<DerivedSignalOptionsWithInit<T, Args>>,
): (...args: Args) => ReactiveValue<T> {
  return (...args) => {
    const scope = getCurrentScope();
    const signal = scope.get(fn, args, opts);
    return useDerivedSignal(signal)!;
  };
}

export function subscription<T>(
  subscribe: SignalSubscribeWithInit<T>,
  opts: SubscriptionOptionsWithInit<T>,
): ReadyReactivePromise<T>;
export function subscription<T>(subscribe: SignalSubscribe<T>, opts?: SubscriptionOptions<T>): ReactivePromise<T>;
export function subscription<T>(
  subscribe: SignalSubscribe<T>,
  opts?: Partial<SubscriptionOptionsWithInit<T>>,
): ReactivePromise<T> | ReadyReactivePromise<T> {
  const scope = getCurrentScope();

  return ReactivePromise.createSubscription(subscribe, scope, opts);
}

export const task = <T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  opts?: Partial<DerivedSignalOptionsWithInit<T, Args>>,
): ReactiveTask<T, Args> => {
  const scope = getCurrentScope();

  return ReactivePromise.createTask(fn, scope, opts);
};

export function watcher<T>(
  fn: () => T,
  opts?: DerivedSignalOptions<T, []> & { scope?: SignalScope; tracer?: Tracer },
): Signal<ReactiveValue<T>> {
  return createDerivedSignal(fn, undefined, undefined, undefined, opts?.scope, opts);
}
