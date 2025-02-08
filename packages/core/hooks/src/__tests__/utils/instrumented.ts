import { afterEach, Assertion, beforeEach, describe, expect, test } from 'vitest';
import {
  createAsyncComputed as _createAsyncComputed,
  createComputed as _createComputed,
  createSubscription as _createSubscription,
  createContext,
  SignalSubscribe,
  useContext,
  withContext,
} from '../../context.js';
import { SignalOptionsWithInit, SignalSubscription, watcher, Watcher } from 'signalium';

class SignalHookCounts {
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

const countsKeys = Object.keys(new SignalHookCounts('')).filter(k => k !== 'name') as (keyof SignalHookCounts)[];

let currentOrder: string[] | undefined = [];
const COUNTS = new WeakMap<object, SignalHookCounts>();

interface CustomMatchers<R = unknown> {
  toHaveValue: (v: any) => Assertion<R>;
  toHaveCounts: (counts: Partial<SignalHookCounts>) => Assertion<R>;
  toHaveValueAndCounts: (v: any, counts: Partial<SignalHookCounts>) => Assertion<R>;
  toHaveComputedOrder: (order: string[]) => Assertion<R>;
  withParams: R extends (...args: infer P) => any ? (...args: P) => Assertion<R> : (...args: any[]) => Assertion<R>;
  withContexts: (contexts: Record<symbol, any>) => Assertion<R>;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends CustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
const NEXT_ARGS = new WeakMap<Function, any[]>();
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
const NEXT_CONTEXTS = new WeakMap<Function, Record<symbol, any>>();

let w: Watcher | undefined;

beforeEach(() => {
  w = watcher();
  w.start({ immediate: true });
});

afterEach(() => {
  w?.stop();
});

function toHaveValue(
  this: { equals(a: unknown, b: unknown): boolean },
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  hook: Function,
  value: any,
) {
  const args = NEXT_ARGS.get(hook) ?? [];
  const contexts = NEXT_CONTEXTS.get(hook);

  NEXT_ARGS.delete(hook);
  NEXT_CONTEXTS.delete(hook);

  let signalValue;

  w!.add(
    () => {
      if (contexts) {
        signalValue = withContext(contexts, () => {
          return hook(...args);
        });
      } else {
        signalValue = hook(...args);
      }
    },
    {
      immediate: true,
    },
  );

  if (signalValue && typeof signalValue === 'object' && 'result' in signalValue) {
    signalValue = signalValue.result;
  }

  return {
    pass: this.equals(signalValue, value),
    message: () => `Expected signal value to be ${JSON.stringify(value)}, but got ${JSON.stringify(signalValue)}`,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function toHaveCounts(hook: Function, counts: SignalHookCounts) {
  const signalCounts = COUNTS.get(hook);

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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  withParams(fn: Function, ...args: any[]) {
    NEXT_ARGS.set(fn, args);

    return {
      pass: true,
      message: () => 'Params match',
    };
  },

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  withContexts(fn: Function, contexts: Record<symbol, any>) {
    NEXT_CONTEXTS.set(fn, contexts);

    return {
      pass: true,
      message: () => 'Contexts match',
    };
  },

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

export const wrapHook = <T, Args extends unknown[]>(original: object, fn: (...args: Args) => T) => {
  const counts = COUNTS.get(original);

  if (!counts) {
    throw new Error('Signal not found in counts map');
  }

  COUNTS.set(fn, counts);

  return fn;
};

export const createComputed: typeof _createComputed = (fn, opts) => {
  const counts = new SignalHookCounts(opts?.desc ?? 'unknown');

  const wrapper = _createComputed((...args) => {
    counts.compute++;

    return fn(...(args as any));
  }, opts);

  COUNTS.set(wrapper, counts);

  return wrapper;
};

export const createAsyncComputed: typeof _createAsyncComputed = (fn, opts) => {
  const counts = new SignalHookCounts(opts?.desc ?? 'unknown');

  const wrapper = _createAsyncComputed((...args) => {
    counts.compute++;

    return fn(...args);
  }, opts) as any;

  COUNTS.set(wrapper, counts);

  return wrapper;
};

export const createSubscription = <T, Args extends unknown[]>(
  fn: SignalSubscribe<T, Args>,
  opts?: Partial<SignalOptionsWithInit<T>>,
): ReturnType<typeof _createSubscription<T, Args>> => {
  const counts = new SignalHookCounts(opts?.desc ?? 'unknown');

  let wrapper = _createSubscription<T, Args>(({ get, set }, ...args) => {
    counts.subscribe++;
    counts.compute++;

    const result = fn(
      {
        get: () => {
          counts.internalGet++;
          return get();
        },
        set: v => {
          counts.internalSet++;
          set(v);
        },
      },
      ...args,
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
          counts.compute++;
          counts.update++;
          result.update!();
        };
      }
    }

    return subscriptionWrapper;
  }, opts);

  COUNTS.set(wrapper, counts);

  return wrapper;
};
