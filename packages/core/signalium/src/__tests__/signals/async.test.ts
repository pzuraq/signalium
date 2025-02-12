import { describe, expect, test } from 'vitest';
import { state, createAsyncComputed, createComputed } from '../utils/instrumented-signals.js';
import { result } from '../utils/builders.js';
import { nextTick, sleep } from '../utils/async.js';

describe('Async Signal functionality', () => {
  test('Can run basic computed', async () => {
    const a = state(1);
    const b = state(2);

    const c = createAsyncComputed(async () => {
      return a.get() + b.get();
    });

    expect(c).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });

    // stability
    expect(c).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });
  });

  test('Computeds can be updated', async () => {
    const a = state(1);
    const b = state(2);

    const c = createAsyncComputed(async () => {
      return a.get() + b.get();
    });

    expect(c).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });

    a.set(2);

    expect(c).toHaveSignalValueAndCounts(result(3, 'pending', 'resolved'), {
      compute: 2,
      resolve: 1,
    });

    await nextTick();

    expect(c).toHaveSignalValueAndCounts(result(4, 'success', 'resolved'), {
      compute: 2,
      resolve: 2,
    });
  });

  test('Does not update if value is the same', async () => {
    const a = state(1);
    const b = state(2);

    const c = createAsyncComputed(async () => {
      return a.get() + b.get();
    });

    expect(c).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });

    a.set(1);

    expect(c).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });

    await nextTick();

    expect(c).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });
  });

  test('Skips resolution if value is updated multiple times', async () => {
    const a = state(1);
    const b = state(2);

    const c = createAsyncComputed(async () => {
      const result = a.get() + b.get();

      if (result === 4) {
        await sleep(10);
      }

      return result;
    });

    expect(c).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });

    a.set(2);

    expect(c).toHaveSignalValueAndCounts(result(3, 'pending', 'resolved'), {
      compute: 2,
      resolve: 1,
    });

    a.set(3);

    expect(c).toHaveSignalValueAndCounts(result(3, 'pending', 'resolved'), {
      compute: 3,
      resolve: 1,
    });

    await sleep(20);

    expect(c).toHaveSignalValueAndCounts(result(5, 'success', 'resolved'), {
      compute: 3,
      resolve: 3,
    });
  });

  test('Can have initial value', async () => {
    const a = state(1);
    const b = state(2);

    const c = createAsyncComputed(
      async () => {
        const result = a.get() + b.get();

        await sleep(10);

        return result;
      },
      {
        initValue: 5,
      },
    );

    expect(c).toHaveSignalValueAndCounts(result(5, 'pending', 'ready'), {
      compute: 1,
      resolve: 0,
    });

    await nextTick();

    expect(c).toHaveSignalValueAndCounts(result(5, 'pending', 'ready'), {
      compute: 1,
      resolve: 0,
    });

    await sleep(20);

    expect(c).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });
  });

  describe('Awaiting', () => {
    test('Awaiting a computed will resolve the value', async () => {
      const compA = createAsyncComputed(async () => {
        await sleep(10);

        return 1;
      });

      const compB = createAsyncComputed(async () => {
        await sleep(10);

        return 2;
      });

      const compC = createAsyncComputed(async () => {
        const a = compA.get().await();
        const b = compB.get().await();

        return a + b;
      });

      // Pull once to start the computation, trigger the computation
      expect(compC).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await nextTick();

      // Check after a tick to make sure we didn't resolve early
      expect(compC).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await sleep(20);

      // Check to make sure we don't resolve early after the first task completes
      expect(compC).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 2,
        resolve: 0,
      });

      await sleep(20);

      expect(compC).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
        compute: 3,
        resolve: 1,
      });
    });

    test('Awaiting a computed can handle errors', async () => {
      const compA = createAsyncComputed(async () => {
        await sleep(10);

        throw 'error';
      });

      const compB = createAsyncComputed(async () => {
        await sleep(20);

        return 2;
      });

      const compC = createAsyncComputed(async () => {
        const a = compA.get().await();
        const b = compB.get().await();

        return a + b;
      });

      // Pull once to start the computation, trigger the computation
      expect(compC).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await sleep(15);

      expect(compC).toHaveSignalValueAndCounts(result(undefined, 'error', 'initial', 'error'), {
        compute: 2,
        resolve: 0,
      });
    });

    test('Awaiting a computed does not let valid values override errors', async () => {
      const compA = createAsyncComputed(async () => {
        await sleep(10);

        throw 'error';
      });

      const compB = createAsyncComputed(async () => {
        await sleep(20);

        return 2;
      });

      const compC = createAsyncComputed(async () => {
        const aResult = compA.get();
        const bResult = compB.get();

        const b = bResult.await();
        const a = aResult.await();

        return a + b;
      });

      // Pull once to start the computation, trigger the computation
      expect(compC).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await sleep(40);

      expect(compC).toHaveSignalValueAndCounts(result(undefined, 'error', 'initial', 'error'), {
        compute: 2,
        resolve: 0,
      });
    });

    test('Await can be composed and nested', async () => {
      const compA = createAsyncComputed(
        async () => {
          await sleep(20);
          return 1;
        },
        { desc: 'compA' },
      );

      const compB = createAsyncComputed(
        async () => {
          await sleep(20);
          return 2;
        },
        { desc: 'compB' },
      );

      const compC = createComputed(
        () => {
          const resultA = compA.get();
          const resultB = compB.get();

          return {
            awaitA: resultA.await,
            awaitB: resultB.await,
          };
        },
        { desc: 'compC' },
      );

      const compD = createAsyncComputed(
        async () => {
          const { awaitA, awaitB } = compC.get();
          const a = awaitA();
          const b = awaitB();

          return a + b;
        },
        { desc: 'compD' },
      );

      // Pull once to start the computation, trigger the computation
      expect(compD).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await sleep(30);

      expect(compD).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
        compute: 2,
        resolve: 1,
      });
    });

    test('Await works with intermediate state', async () => {
      const compA = createAsyncComputed(async () => {
        await sleep(20);
        return 1;
      });

      const compB = createAsyncComputed(async () => {
        await sleep(40);
        return 2;
      });

      const compC = createComputed(() => {
        const resultA = compA.get();
        const resultB = compB.get();

        return {
          awaitA: resultA.await,
          awaitB: resultB.await,
        };
      });

      const compD = createAsyncComputed(async () => {
        const { awaitA, awaitB } = compC.get();
        const a = awaitA();
        const b = awaitB();

        return a + b;
      });

      // Pull once to start the computation, trigger the computation
      expect(compD).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await sleep(30);

      expect(compD).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 2,
        resolve: 0,
      });

      await sleep(30);

      expect(compD).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
        compute: 3,
        resolve: 1,
      });
    });
  });
});
