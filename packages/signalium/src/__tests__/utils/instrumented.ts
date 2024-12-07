import { expect } from 'vitest';
import {
  state as createState,
  computed as createComputed,
  asyncComputed as createAsyncComputed,
  subscription as createSubscription,
  watcher as createWatcher,
  SignalOptions,
  Signal,
  WriteableSignal,
  SignalCompute,
  SignalAsyncCompute,
  AsyncResult,
  SignalSubscribe,
  SignalSubscription,
  SignalOptionsWithInit,
  AsyncReady,
  Watcher,
  SignalWatcherEffect,
  AsyncSignal,
} from '../../signals.js';

class SignalCounts {
  name: string;

  get = 0;
  set = 0;
  compute = 0;

  resolve = 0;

  subscribe = 0;
  update = 0;
  unsubscribe = 0;
  internalGet = 0;
  internalSet = 0;

  effect = 0;

  constructor(name: string) {
    this.name = name;
  }
}

const countsKeys = Object.keys(new SignalCounts('')).filter(k => k !== 'name') as (keyof SignalCounts)[];

let currentOrder: string[] | undefined = [];
const COUNTS = new WeakMap<Signal<any> | Watcher, SignalCounts>();

interface CustomMatchers<R = unknown> {
  toHaveValue: (v: any) => R;
  toHaveCounts: (counts: Partial<SignalCounts>) => R;
  toHaveValueAndCounts: (v: any, counts: Partial<SignalCounts>) => R;
  toHaveComputedOrder: (order: string[]) => R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends CustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

function toHaveValue(this: { equals(a: unknown, b: unknown): boolean }, signal: Signal<any>, value: any) {
  const signalValue = signal.get();

  return {
    pass: this.equals(signalValue, value),
    message: () => `Expected signal value to be ${JSON.stringify(value)}, but got ${JSON.stringify(signalValue)}`,
  };
}

function toHaveCounts(signal: Signal<any>, counts: SignalCounts) {
  const signalCounts = COUNTS.get(signal);

  if (!signalCounts) {
    return {
      pass: false,
      message: () => 'Signal not found in counts map',
    };
  }

  for (const key of countsKeys) {
    const count = counts[key];

    if (count !== undefined && signalCounts[key] !== count) {
      return {
        pass: false,
        message: () => `Expected ${key} count to be ${count} but got ${signalCounts[key]}`,
      };
    }
  }

  return {
    pass: true,
    message: () => 'Counts match',
  };
}

expect.extend({
  toHaveValue,
  toHaveCounts,

  toHaveValueAndCounts(signal, value, counts) {
    const valueResult = toHaveValue.call(this, signal, value);
    const countsResult = toHaveCounts.call(this, signal, counts);

    return {
      pass: valueResult.pass && countsResult.pass,
      message: () => {
        const messages = [
          !valueResult.pass && valueResult.message(),
          !countsResult.pass && countsResult.message(),
        ].filter(m => m);

        return messages.join('\n');
      },
    };
  },

  toHaveComputedOrder(fn: () => void, expectedOrder: string[]) {
    const order = (currentOrder = []);

    fn();

    currentOrder = undefined;

    return {
      pass: this.equals(order, expectedOrder),
      message: () => `Expected compute count to be ${expectedOrder.toString()} but got ${order.toString()}`,
    };
  },
});

export const state = <T>(initialValue: T, opts?: SignalOptions<T> & { name?: string }): WriteableSignal<T> => {
  const name = opts?.name || 'unlabeled';
  const s = createState(initialValue, opts);

  const counts = new SignalCounts(name);

  const wrapper = {
    get() {
      counts.get++;
      return s.get();
    },

    set(value: T) {
      counts.set++;
      s.set(value);
    },
  };

  COUNTS.set(wrapper, counts);

  return wrapper;
};

export function computed<T>(name: string, compute: SignalCompute<T>, opts?: SignalOptions<T>): Signal<T>;
export function computed<T>(compute: SignalCompute<T>, opts?: SignalOptions<T>): Signal<T>;
export function computed<T>(
  nameOrCompute: string | SignalCompute<T>,
  computeOrOpts?: SignalCompute<T> | SignalOptions<T>,
  maybeOpts?: SignalOptions<T>,
): Signal<T> {
  const name = typeof nameOrCompute === 'string' ? nameOrCompute : 'unlabeled';
  const compute = typeof nameOrCompute === 'string' ? (computeOrOpts as SignalCompute<T>) : nameOrCompute;
  const opts = typeof nameOrCompute === 'string' ? maybeOpts : (computeOrOpts as SignalOptions<T>);
  const counts = new SignalCounts(name);

  const s = createComputed(v => {
    counts.compute++;

    if (name) {
      currentOrder?.push(name);
    }

    return compute(v);
  }, opts);

  const wrapper = {
    get() {
      counts.get++;
      return s.get();
    },
  };

  COUNTS.set(wrapper, counts);

  return wrapper;
}

export function asyncComputed<T>(name: string, compute: SignalAsyncCompute<T>, opts?: SignalOptions<T>): Signal<T>;
export function asyncComputed<T>(
  name: string,
  compute: SignalAsyncCompute<T>,
  opts: SignalOptionsWithInit<T>,
): Signal<T>;
export function asyncComputed<T>(compute: SignalAsyncCompute<T>, opts?: SignalOptions<T>): AsyncSignal<T>;
export function asyncComputed<T>(compute: SignalAsyncCompute<T>, opts: SignalOptionsWithInit<T>): AsyncSignal<T>;
export function asyncComputed<T>(
  nameOrCompute: string | SignalAsyncCompute<T>,
  computeOrOpts?: SignalCompute<T> | Partial<SignalOptionsWithInit<T>>,
  maybeOpts?: Partial<SignalOptionsWithInit<T>>,
): AsyncSignal<T> {
  const name = typeof nameOrCompute === 'string' ? nameOrCompute : 'unlabeled';
  const compute = typeof nameOrCompute === 'string' ? (computeOrOpts as SignalCompute<T>) : nameOrCompute;
  const opts = typeof nameOrCompute === 'string' ? maybeOpts : (computeOrOpts as SignalOptions<T>);
  const counts = new SignalCounts(name);

  const s = createAsyncComputed(async v => {
    counts.compute++;

    if (name) {
      currentOrder?.push(name);
    }

    const result = await compute(v);

    counts.resolve++;

    return result;
  }, opts);

  const wrapper = {
    get() {
      counts.get++;
      return s.get();
    },

    invalidate() {
      s.invalidate();
    },

    await() {
      return s.await();
    },
  };

  COUNTS.set(wrapper, counts);

  return wrapper;
}

export function subscription<T>(
  name: string,
  subscribe: SignalSubscribe<T>,
  opts?: SignalOptions<T>,
): Signal<T | undefined>;
export function subscription<T>(name: string, subscribe: SignalSubscribe<T>, opts: SignalOptionsWithInit<T>): Signal<T>;
export function subscription<T>(subscribe: SignalSubscribe<T>, opts?: SignalOptions<T>): Signal<T | undefined>;
export function subscription<T>(subscribe: SignalSubscribe<T>, opts: SignalOptionsWithInit<T>): Signal<T>;
export function subscription<T>(
  nameOrSubscribe: string | SignalSubscribe<T>,
  subscribeOrOpts?: SignalSubscribe<T> | Partial<SignalOptionsWithInit<T>>,
  maybeOpts?: Partial<SignalOptionsWithInit<T>>,
): Signal<T> | Signal<T | undefined> {
  const name = typeof nameOrSubscribe === 'string' ? nameOrSubscribe : 'unlabeled';
  const subscribe = typeof nameOrSubscribe === 'string' ? (subscribeOrOpts as SignalSubscribe<T>) : nameOrSubscribe;
  const opts = typeof nameOrSubscribe === 'string' ? maybeOpts : (subscribeOrOpts as SignalOptions<T>);
  const counts = new SignalCounts(name);

  const s = createSubscription((get, set) => {
    counts.subscribe++;

    if (name) {
      currentOrder?.push(name);
    }

    const result = subscribe(
      () => {
        counts.internalGet++;
        return get();
      },
      v => {
        counts.internalSet++;
        set(v);
      },
    );

    let subscriptionWrapper: SignalSubscription | undefined;

    if (result) {
      subscriptionWrapper = {};

      if (result.unsubscribe) {
        subscriptionWrapper.unsubscribe = () => {
          counts.unsubscribe++;
          result.unsubscribe!();
        };
      }

      if (result.update) {
        subscriptionWrapper.update = () => {
          counts.update++;
          result.update!();
        };
      }
    }

    return subscriptionWrapper;
  }, opts);

  const wrapper = {
    get() {
      counts.get++;
      return s.get();
    },
  };

  COUNTS.set(wrapper, counts);

  return wrapper;
}

export function watcher<T>(effect: SignalWatcherEffect): Watcher;
export function watcher<T>(name: string, effect: SignalWatcherEffect): Watcher;
export function watcher<T>(nameOrEffect: string | SignalWatcherEffect, maybeEffect?: SignalWatcherEffect): Watcher {
  const name = typeof nameOrEffect === 'string' ? nameOrEffect : 'unlabeled';
  const effect = typeof nameOrEffect === 'string' ? (maybeEffect as SignalWatcherEffect) : nameOrEffect;

  const counts = new SignalCounts(name);

  const w = createWatcher(() => {
    counts.effect++;

    if (name) {
      currentOrder?.push(name);
    }

    effect();
  });

  COUNTS.set(w, counts);

  return w;
}
