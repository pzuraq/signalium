import { describe, expect, test } from 'vitest';
import { state, computed, asyncComputed } from './utils/instrumented.js';
import { AsyncResult } from '../signals';

const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));
const nextTick = () => new Promise(r => setTimeout(r, 0));

const result = <T>(
  value: T | undefined,
  promiseState: 'pending' | 'error' | 'success',
  isReady: boolean,
): AsyncResult<T> =>
  ({
    result: value,
    error: undefined,
    isPending: promiseState === 'pending',
    isReady,
    isError: promiseState === 'error',
    isSuccess: promiseState === 'success',
  }) as AsyncResult<T>;

describe('Async Signal functionality', () => {
  test('Can run basic computed', async () => {
    const a = state(1);
    const b = state(2);

    const c = asyncComputed(async () => {
      return a.get() + b.get();
    });

    expect(c).toHaveValueAndCounts(result(undefined, 'pending', false), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(3, 'success', true), {
      compute: 1,
      resolve: 1,
    });

    // stability
    expect(c).toHaveValueAndCounts(result(3, 'success', true), {
      compute: 1,
      resolve: 1,
    });
  });

  test('Computeds can be updated', async () => {
    const a = state(1);
    const b = state(2);

    const c = asyncComputed(async () => {
      return a.get() + b.get();
    });

    expect(c).toHaveValueAndCounts(result(undefined, 'pending', false), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(3, 'success', true), {
      compute: 1,
      resolve: 1,
    });

    a.set(2);

    expect(c).toHaveValueAndCounts(result(3, 'pending', true), {
      compute: 2,
      resolve: 1,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(4, 'success', true), {
      compute: 2,
      resolve: 2,
    });
  });

  test('Does not update if value is the same', async () => {
    const a = state(1);
    const b = state(2);

    const c = asyncComputed(async () => {
      return a.get() + b.get();
    });

    expect(c).toHaveValueAndCounts(result(undefined, 'pending', false), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(3, 'success', true), {
      compute: 1,
      resolve: 1,
    });

    a.set(1);

    expect(c).toHaveValueAndCounts(result(3, 'success', true), {
      compute: 1,
      resolve: 1,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(3, 'success', true), {
      compute: 1,
      resolve: 1,
    });
  });

  test('Skips resolution if value is updated multiple times', async () => {
    const a = state(1);
    const b = state(2);

    const c = asyncComputed(async () => {
      const result = a.get() + b.get();

      if (result === 4) {
        await sleep(100);
      }

      return result;
    });

    expect(c).toHaveValueAndCounts(result(undefined, 'pending', false), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(3, 'success', true), {
      compute: 1,
      resolve: 1,
    });

    a.set(2);

    expect(c).toHaveValueAndCounts(result(3, 'pending', true), {
      compute: 2,
      resolve: 1,
    });

    a.set(3);

    expect(c).toHaveValueAndCounts(result(3, 'pending', true), {
      compute: 3,
      resolve: 1,
    });

    await sleep(200);

    expect(c).toHaveValueAndCounts(result(5, 'success', true), {
      compute: 3,
      resolve: 3,
    });
  });

  describe('Awaiting', () => {
    test('Awaiting a computed will resolve the value', async () => {
      const compA = asyncComputed(async () => {
        await sleep(20);

        return 1;
      });

      const compB = asyncComputed(async () => {
        await sleep(20);

        return 2;
      });

      const compC = asyncComputed(async () => {
        const a = compA.await();
        const b = compB.await();

        return a + b;
      });

      // Pull once to start the computation, trigger the computation
      expect(compC).toHaveValueAndCounts(result(undefined, 'pending', false), {
        compute: 1,
        resolve: 0,
      });

      await nextTick();

      // Check after a tick to make sure we didn't resolve early
      expect(compC).toHaveValueAndCounts(result(undefined, 'pending', false), {
        compute: 1,
        resolve: 0,
      });

      await sleep(30);

      // Check to make sure we don't resolve early after the first task completes
      expect(compC).toHaveValueAndCounts(result(undefined, 'pending', false), {
        compute: 2,
        resolve: 0,
      });

      await sleep(30);

      expect(compC).toHaveValueAndCounts(result(3, 'success', true), {
        compute: 3,
        resolve: 1,
      });
    });

    test('Awaiting a computed can handle errors', async () => {
      const compA = asyncComputed(async () => {
        await sleep(20);

        throw 'error';
      });

      const compB = asyncComputed(async () => {
        await sleep(20);

        return 2;
      });

      const compC = asyncComputed(async () => {
        const a = compA.await();
        const b = compB.await();

        return a + b;
      });

      // Pull once to start the computation, trigger the computation
      expect(compC).toHaveValueAndCounts(result(undefined, 'pending', false), {
        compute: 1,
        resolve: 0,
      });

      await sleep(50);

      expect(compC).toHaveValueAndCounts(
        {
          result: undefined,
          error: 'error',
          isPending: false,
          isReady: false,
          isError: true,
          isSuccess: false,
        },
        {
          compute: 2,
          resolve: 0,
        },
      );
    });
  });
});
