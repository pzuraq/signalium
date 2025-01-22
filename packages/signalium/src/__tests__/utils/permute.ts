import { describe } from 'vitest';
import { asyncComputed, computed, subscription, wrapHook } from './instrumented-hooks.js';
import { SignalOptionsWithInit } from '../../types.js';

const createMethods = [
  {
    name: 'createComputed',
    create: computed,
  },
  {
    name: 'createAsyncComputed',
    create: <T, Args extends unknown[]>(
      fn: (...args: Args) => T | Promise<T>,
      opts?: Partial<SignalOptionsWithInit<T, Args>>,
    ) => {
      const computed = asyncComputed(fn, opts);

      return wrapHook(computed, (...args: Args) => {
        return computed(...args).result;
      });
    },
  },
  {
    name: 'createSubscription',
    create: function _createSubscription<T, Args extends unknown[]>(
      fn: (...args: Args) => T,
      opts?: Partial<SignalOptionsWithInit<T, Args>>,
    ): (...args: Args) => T {
      return subscription(({ set }, ...args) => {
        set(fn(...args));

        return {
          update: () => {
            set(fn(...args));
          },
        };
      }, opts);
    },
  },
];

function generatePermutations(n: number, m: number): number[][] {
  const results: number[][] = [];

  function generate(current: number[], remaining: number) {
    if (remaining === 0) {
      results.push([...current]);
      return;
    }

    for (let i = 0; i < n; i++) {
      current.push(i);
      generate(current, remaining - 1);
      current.pop();
    }
  }

  generate([], m);
  return results;
}

type CreateMethod = (typeof createMethods)[number]['create'];

export function permute(m: number, fn: (...args: CreateMethod[]) => void) {
  const testCases = generatePermutations(createMethods.length, m);

  for (const testCase of testCases) {
    const testMethods = [createMethods[testCase[0]], ...testCase.slice(1).map(i => createMethods[i])];

    describe(`${testMethods.map(m => m.name).join(', ')}`, () => {
      fn(...testMethods.map(m => m.create));
    });
  }
}
