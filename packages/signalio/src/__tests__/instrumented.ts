import { expect } from 'vitest';
import {
  state as createState,
  computed as createComputed,
  SignalOptions,
  Signal,
  StateSignal,
  SignalCompute,
} from '../index';

interface SignalCounts {
  get: number;
  set: number;
  compute: number;
}

const COUNTS = new WeakMap<Signal<any>, SignalCounts>();

interface CustomMatchers<R = unknown> {
  toHaveValue: (v: any) => R;
  toHaveCounts: (counts: Partial<SignalCounts>) => R;
  toHaveValueAndCounts: (v: any, counts: Partial<SignalCounts>) => R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

function toHaveValue(signal: Signal<any>, value: any) {
  const signalValue = signal.get();

  return {
    pass: signalValue === value,
    message: () =>
      `Expected signal value to be ${value}, but got ${signalValue}`,
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

  if (counts.get !== undefined && signalCounts.get !== counts.get) {
    return {
      pass: false,
      message: () =>
        `Expected get count to be ${counts.get} but got ${signalCounts.get}`,
    };
  }

  if (counts.set !== undefined && signalCounts.set !== counts.set) {
    return {
      pass: false,
      message: () =>
        `Expected set count to be ${counts.set} but got ${signalCounts.set}`,
    };
  }

  if (counts.compute !== undefined && signalCounts.compute !== counts.compute) {
    return {
      pass: false,
      message: () =>
        `Expected compute count to be ${counts.compute} but got ${signalCounts.compute}`,
    };
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
    const valueResult = toHaveValue(signal, value);
    const countsResult = toHaveCounts(signal, counts);

    return {
      pass: valueResult.pass && countsResult.pass,
      message: () => {
        const messages = [
          !valueResult.pass && valueResult.message(),
          !countsResult.pass && countsResult.message(),
        ].filter((m) => m);

        return messages.join('\n');
      },
    };
  },
});

export const state = <T>(
  initialValue: T,
  opts?: SignalOptions<T>
): StateSignal<T> => {
  const s = createState(initialValue, opts);

  const counts = { get: 0, set: 0, compute: 0 };

  const wrapper = {
    get() {
      counts.get++;
      return s.get();
    },

    set(value) {
      counts.set++;
      s.set(value);
    },
  };

  COUNTS.set(wrapper, counts);

  return wrapper;
};

export const computed = <T>(
  compute: SignalCompute<T>,
  opts?: SignalOptions<T>
): Signal<T> => {
  const counts = { get: 0, set: 0, compute: 0 };

  const s = createComputed((v) => {
    counts.compute++;
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
};
