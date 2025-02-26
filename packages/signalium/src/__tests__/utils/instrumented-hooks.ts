import { afterEach, Assertion, beforeEach, expect } from 'vitest';
import {
  asyncComputed as _asyncComputed,
  asyncTask as _asyncTask,
  computed as _computed,
  subscription as _subscription,
  watcher,
  SignalSubscribe,
  withContext,
} from '../../index.js';
import { SignalOptionsWithInit, SignalSubscription, Watcher } from '../../types.js';

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
  toHaveHookValue: (v: any) => Assertion<R>;
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

let w: Watcher<unknown> | undefined;

let unsubs: (() => void)[] = [];

afterEach(() => {
  unsubs.forEach(unsub => unsub());
});

function toHaveHookValue(
  this: { equals(a: unknown, b: unknown): boolean },
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  hook: Function,
  value: any,
) {
  const args = NEXT_ARGS.get(hook) ?? [];
  const contexts = NEXT_CONTEXTS.get(hook);

  NEXT_ARGS.delete(hook);
  NEXT_CONTEXTS.delete(hook);

  let w = watcher(() => {
    if (contexts) {
      return withContext(contexts, () => {
        return hook(...args);
      });
    } else {
      return hook(...args);
    }
  });

  let signalValue: any;
  unsubs.push(
    w.addListener(
      (v: any) => {
        signalValue = v;
      },
      {
        immediate: true,
      },
    ),
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
  toHaveHookValue,
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
    const valueResult = toHaveHookValue.call(this, signal, value);
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

export const computed: typeof _computed = (fn, opts) => {
  const counts = new SignalHookCounts(opts?.desc ?? 'unknown');

  const wrapper = _computed((...args) => {
    counts.compute++;

    return fn(...(args as any));
  }, opts);

  COUNTS.set(wrapper, counts);

  return wrapper;
};

export const asyncComputed: typeof _asyncComputed = (fn, opts) => {
  const counts = new SignalHookCounts(opts?.desc ?? 'unknown');

  const wrapper = _asyncComputed((...args) => {
    counts.compute++;

    return fn(...(args as any));
  }, opts) as any;

  COUNTS.set(wrapper, counts);

  return wrapper;
};

export const asyncTask: typeof _asyncTask = (fn, opts) => {
  const counts = new SignalHookCounts(opts?.desc ?? 'unknown');

  const wrapper = _asyncTask((...args) => {
    counts.compute++;

    return fn(...(args as any));
  }, opts) as any;

  COUNTS.set(wrapper, counts);

  return wrapper;
};

export const subscription = <T, Args extends unknown[]>(
  fn: SignalSubscribe<T, Args>,
  opts?: Partial<SignalOptionsWithInit<T, Args>>,
): ReturnType<typeof _subscription<T, Args>> => {
  const counts = new SignalHookCounts(opts?.desc ?? 'unknown');

  let wrapper = _subscription<T, Args>(({ get, set }, ...args) => {
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

    let subscriptionWrapper: SignalSubscription | (() => unknown) | undefined;

    if (result) {
      if (typeof result === 'function') {
        subscriptionWrapper = () => {
          counts.unsubscribe++;
          result();
        };
      } else {
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
    }

    return subscriptionWrapper;
  }, opts);

  COUNTS.set(wrapper, counts);

  return wrapper;
};
