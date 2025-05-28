import {
  ReactiveTask,
  ReactiveValue,
  ReadyReactivePromise,
  ReadyReactiveValue,
  Signal,
  SignalOptions,
  SignalSubscribe,
  type SignalOptionsWithInit,
} from './types.js';
import { useDerivedSignal } from './config.js';
import { getCurrentScope, SignalScope } from './internals/contexts.js';
import { createStateSignal } from './internals/state.js';
import { createDerivedSignal, DerivedSignalDefinition } from './internals/derived.js';
import { ReactivePromise } from './internals/async.js';
import { Tracer } from './trace.js';
import { equalsFrom } from './internals/utils/equals.js';

export const state = createStateSignal;

export function reactive<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts?: Partial<SignalOptionsWithInit<T, Args>>,
): (...args: Args) => ReactiveValue<T>;
export function reactive<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts: SignalOptionsWithInit<T, Args>,
): (...args: Args) => ReadyReactiveValue<T>;
export function reactive<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts?: Partial<SignalOptionsWithInit<T, Args>>,
): (...args: Args) => ReactiveValue<T> {
  const def: DerivedSignalDefinition<T, Args> = {
    compute: fn,
    equals: equalsFrom(opts?.equals),
    shouldGC: opts?.shouldGC,
    isSubscription: false,
  };

  return (...args) => {
    const scope = getCurrentScope();
    const signal = scope.get(def, args, opts);

    return useDerivedSignal(signal)!;
  };
}

export function subscription<T>(subscribe: SignalSubscribe<T>, opts?: SignalOptions<T, unknown[]>): ReactivePromise<T>;
export function subscription<T>(
  subscribe: SignalSubscribe<T>,
  opts: SignalOptionsWithInit<T, unknown[]>,
): ReadyReactivePromise<T>;
export function subscription<T>(
  subscribe: SignalSubscribe<T>,
  opts?: Partial<SignalOptionsWithInit<T, unknown[]>>,
): ReactivePromise<T> | ReadyReactivePromise<T> {
  const scope = getCurrentScope();

  return ReactivePromise.createSubscription(subscribe, scope, opts);
}

export const task = <T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  opts?: Partial<SignalOptionsWithInit<T, Args>>,
): ReactiveTask<T, Args> => {
  const scope = getCurrentScope();

  return ReactivePromise.createTask(fn, scope, opts);
};

export function watcher<T>(
  fn: () => T,
  opts?: SignalOptions<T, unknown[]> & { scope?: SignalScope; tracer?: Tracer },
): Signal<ReactiveValue<T>> {
  const def: DerivedSignalDefinition<T, unknown[]> = {
    compute: fn,
    equals: equalsFrom(opts?.equals),
    isSubscription: false,
  };

  return createDerivedSignal(def, undefined, undefined, opts?.scope, opts);
}
