import { expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createStateSignal as _createStateSignal,
  createComputedSignal as _createComputedSignal,
  createAsyncComputedSignal as _createAsyncComputedSignal,
  createSubscriptionSignal as _createSubscriptionSignal,
  createWatcherSignal as _createWatcherSignal,
  SignalOptions,
  Signal,
  WriteableSignal,
  SignalSubscription,
  Watcher,
} from '../../index.js';

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
const COUNTS = new WeakMap<Signal<any> | Watcher<any>, SignalCounts>();

interface CustomMatchers<R = unknown> {
  toHaveSignalValue: (v: any) => R;
  toHaveSignalCounts: (counts: Partial<SignalCounts>) => R;
  toHaveSignalValueAndCounts: (v: any, counts: Partial<SignalCounts>) => R;
  toHaveComputedOrder: (order: string[]) => R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends CustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

function toHaveSignalValue(this: { equals(a: unknown, b: unknown): boolean }, signal: Signal<any>, value: any) {
  const signalValue = signal.get();

  return {
    pass: this.equals(signalValue, value),
    message: () => `Expected signal value to be ${JSON.stringify(value)}, but got ${JSON.stringify(signalValue)}`,
  };
}

function toHaveSignalCounts(signal: Signal<any>, counts: SignalCounts) {
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
  toHaveSignalValue,
  toHaveSignalCounts,

  toHaveSignalValueAndCounts(signal, value, counts) {
    const valueResult = toHaveSignalValue.call(this, signal, value);
    const countsResult = toHaveSignalCounts.call(this, signal, counts);

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

export const createStateSignal = <T>(initialValue: T, opts?: SignalOptions<T>): WriteableSignal<T> => {
  const desc = opts?.desc || 'unlabeled';
  const s = _createStateSignal(initialValue, opts);

  const counts = new SignalCounts(desc);

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

export const createComputedSignal: typeof _createComputedSignal = (compute, opts) => {
  const desc = opts?.desc || 'unlabeled';
  const counts = new SignalCounts(desc);

  const s = _createComputedSignal(v => {
    counts.compute++;

    if (desc) {
      currentOrder?.push(desc);
    }

    return compute(v);
  }, opts);

  const wrapper = {
    get() {
      counts.get++;

      // Get twice to ensure idempotency
      s.get();

      return s.get();
    },
  };

  COUNTS.set(wrapper, counts);

  return wrapper;
};

export const createAsyncComputedSignal: typeof _createAsyncComputedSignal = (compute, opts) => {
  const desc = opts?.desc || 'unlabeled';
  const counts = new SignalCounts(desc);

  const s = _createAsyncComputedSignal(async v => {
    counts.compute++;

    if (desc) {
      currentOrder?.push(desc);
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
  };

  COUNTS.set(wrapper, counts);

  return wrapper;
};

export const createSubscriptionSignal: typeof _createSubscriptionSignal = (subscribe, opts) => {
  const desc = opts?.desc || 'unlabeled';
  const counts = new SignalCounts(desc);

  const s = _createSubscriptionSignal((get, set) => {
    counts.subscribe++;

    if (desc) {
      currentOrder?.push(desc);
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

    const subscriptionWrapper: SignalSubscription = {
      unsubscribe() {
        counts.unsubscribe++;
        result?.unsubscribe?.();
      },

      update() {
        counts.update++;
        result?.update?.();
      },
    };

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
};

export function createWatcherSignal<T>(fn: () => T, opts?: SignalOptions<T>): Watcher<T> {
  const desc = opts?.desc || 'unlabeled';
  const counts = new SignalCounts(desc);

  const w = _createWatcherSignal<T>(() => {
    counts.compute++;
    return fn();
  }, opts);

  const wrapper: Watcher<T> = {
    addListener: (fn, opts) => {
      counts.subscribe++;
      return w.addListener(v => {
        counts.effect++;
        return fn(v);
      }, opts);
    },
  };

  COUNTS.set(wrapper, counts);

  return wrapper;
}
