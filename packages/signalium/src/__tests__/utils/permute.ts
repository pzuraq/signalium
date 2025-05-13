import { describe } from 'vitest';
import { ReactiveBuilderFunction, reactive, subscription } from './instrumented-hooks.js';
import { DerivedSignalOptionsWithInit } from '../../types.js';

const createMethods = [
  {
    name: 'createComputed',
    create: reactive,
  },
  {
    name: 'createAsyncComputed',
    create: <T, Args extends unknown[]>(
      fn: (...args: Args) => T | Promise<T>,
      opts?: Partial<DerivedSignalOptionsWithInit<Promise<T>, Args>>,
    ): ReactiveBuilderFunction<T, Args> => {
      const computed = reactive(async (...args: Args) => {
        return fn(...args);
      }, opts);

      return reactive((...args: Args) => {
        return computed(...args).value as T;
      });
    },
  },
  {
    name: 'createSubscription',
    create: function _createSubscription<T, Args extends unknown[]>(
      fn: (...args: Args) => T,
      opts?: Partial<DerivedSignalOptionsWithInit<T, Args>>,
    ): ReactiveBuilderFunction<T, Args> {
      const computed = reactive((...args: Args) => {
        return subscription(
          state => {
            state.set(fn(...args));

            return {
              update: () => {
                state.set(fn(...args));
              },
            };
          },
          opts as Partial<DerivedSignalOptionsWithInit<T, unknown[]>>,
        );
      });

      return reactive((...args: Args) => {
        return computed(...args).value as T;
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
