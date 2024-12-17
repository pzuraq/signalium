import { describe, expect, test } from 'vitest';
import { state, asyncComputed, computed } from './utils/instrumented.js';
import { AsyncResult } from '../signals';

const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));
const nextTick = () => new Promise(r => setTimeout(r, 0));

const result = <T>(
  value: T | undefined,
  promiseState: 'pending' | 'error' | 'success',
  readyState: 'initial' | 'ready' | 'resolved',
  error?: any,
): AsyncResult<T> =>
  ({
    result: value,
    error,
    isPending: promiseState === 'pending',
    isError: promiseState === 'error',
    isSuccess: promiseState === 'success',

    isReady: readyState === 'ready' || readyState === 'resolved',
    didResolve: readyState === 'resolved',

    await: expect.any(Function),
    invalidate: expect.any(Function),
  }) as AsyncResult<T>;

describe('Async Signal functionality', () => {
  test('Can run basic computed', async () => {
    const a = state(1);
    const b = state(2);

    const c = asyncComputed(async () => {
      return a.get() + b.get();
    });

    expect(c).toHaveValueAndCounts(result(undefined, 'pending', 'initial'), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });

    // stability
    expect(c).toHaveValueAndCounts(result(3, 'success', 'resolved'), {
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

    expect(c).toHaveValueAndCounts(result(undefined, 'pending', 'initial'), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });

    a.set(2);

    expect(c).toHaveValueAndCounts(result(3, 'pending', 'resolved'), {
      compute: 2,
      resolve: 1,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(4, 'success', 'resolved'), {
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

    expect(c).toHaveValueAndCounts(result(undefined, 'pending', 'initial'), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });

    a.set(1);

    expect(c).toHaveValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(3, 'success', 'resolved'), {
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
        await sleep(10);
      }

      return result;
    });

    expect(c).toHaveValueAndCounts(result(undefined, 'pending', 'initial'), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });

    a.set(2);

    expect(c).toHaveValueAndCounts(result(3, 'pending', 'resolved'), {
      compute: 2,
      resolve: 1,
    });

    a.set(3);

    expect(c).toHaveValueAndCounts(result(3, 'pending', 'resolved'), {
      compute: 3,
      resolve: 1,
    });

    await sleep(20);

    expect(c).toHaveValueAndCounts(result(5, 'success', 'resolved'), {
      compute: 3,
      resolve: 3,
    });
  });

  test('Can have initial value', async () => {
    const a = state(1);
    const b = state(2);

    const c = asyncComputed(
      async () => {
        const result = a.get() + b.get();

        await sleep(10);

        return result;
      },
      {
        initValue: 5,
      },
    );

    expect(c).toHaveValueAndCounts(result(5, 'pending', 'ready'), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveValueAndCounts(result(5, 'pending', 'ready'), {
      compute: 1,
      resolve: 0,
    });

    await sleep(20);

    expect(c).toHaveValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });
  });

  describe('Awaiting', () => {
    test('Awaiting a computed will resolve the value', async () => {
      const compA = asyncComputed(async () => {
        await sleep(10);

        return 1;
      });

      const compB = asyncComputed(async () => {
        await sleep(10);

        return 2;
      });

      const compC = asyncComputed(async () => {
        const a = compA.get().await();
        const b = compB.get().await();

        return a + b;
      });

      // Pull once to start the computation, trigger the computation
      expect(compC).toHaveValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await nextTick();

      // Check after a tick to make sure we didn't resolve early
      expect(compC).toHaveValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await sleep(10);

      // Check to make sure we don't resolve early after the first task completes
      expect(compC).toHaveValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 2,
        resolve: 0,
      });

      await sleep(10);

      expect(compC).toHaveValueAndCounts(result(3, 'success', 'resolved'), {
        compute: 3,
        resolve: 1,
      });
    });

    test('Awaiting a computed can handle errors', async () => {
      const compA = asyncComputed(async () => {
        await sleep(10);

        throw 'error';
      });

      const compB = asyncComputed(async () => {
        await sleep(20);

        return 2;
      });

      const compC = asyncComputed(async () => {
        const a = compA.get().await();
        const b = compB.get().await();

        return a + b;
      });

      // Pull once to start the computation, trigger the computation
      expect(compC).toHaveValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await sleep(10);

      expect(compC).toHaveValueAndCounts(result(undefined, 'error', 'initial', 'error'), {
        compute: 2,
        resolve: 0,
      });
    });

    test('Awaiting a computed does not let valid values override errors', async () => {
      const compA = asyncComputed(async () => {
        await sleep(10);

        throw 'error';
      });

      const compB = asyncComputed(async () => {
        await sleep(20);

        return 2;
      });

      const compC = asyncComputed(async () => {
        const aResult = compA.get();
        const bResult = compB.get();

        const b = bResult.await();
        const a = aResult.await();

        return a + b;
      });

      // Pull once to start the computation, trigger the computation
      expect(compC).toHaveValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await sleep(30);

      expect(compC).toHaveValueAndCounts(result(undefined, 'error', 'initial', 'error'), {
        compute: 2,
        resolve: 0,
      });
    });

    test('Await can be composed and nested', async () => {
      const compA = asyncComputed('compA', async () => {
        await sleep(20);
        return 1;
      });

      const compB = asyncComputed('compB', async () => {
        await sleep(20);
        return 2;
      });

      const compC = computed('compC', () => {
        const resultA = compA.get();
        const resultB = compB.get();

        return {
          awaitA: resultA.await,
          awaitB: resultB.await,
        };
      });

      const compD = asyncComputed('compD', async () => {
        const { awaitA, awaitB } = compC.get();
        const a = awaitA();
        const b = awaitB();

        return a + b;
      });

      // Pull once to start the computation, trigger the computation
      expect(compD).toHaveValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await sleep(30);

      expect(compD).toHaveValueAndCounts(result(3, 'success', 'resolved'), {
        compute: 3,
        resolve: 1,
      });
    });

    test('Await works with intermediate state', async () => {
      const compA = asyncComputed('compA', async () => {
        await sleep(20);
        return 1;
      });

      const compB = asyncComputed('compB', async () => {
        await sleep(40);
        return 2;
      });

      const compC = computed('compC', () => {
        const resultA = compA.get();
        const resultB = compB.get();

        return {
          awaitA: resultA.await,
          awaitB: resultB.await,
        };
      });

      const compD = asyncComputed('compD', async () => {
        const { awaitA, awaitB } = compC.get();
        const a = awaitA();
        const b = awaitB();

        return a + b;
      });

      // Pull once to start the computation, trigger the computation
      expect(compD).toHaveValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await sleep(30);

      expect(compD).toHaveValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 2,
        resolve: 0,
      });

      await sleep(30);

      expect(compD).toHaveValueAndCounts(result(3, 'success', 'resolved'), {
        compute: 3,
        resolve: 1,
      });
    });
  });
});
