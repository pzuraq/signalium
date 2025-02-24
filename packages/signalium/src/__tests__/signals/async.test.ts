import { describe, expect, test } from 'vitest';
import { createStateSignal, createAsyncComputedSignal, createComputedSignal } from '../utils/instrumented-signals.js';
import { result } from '../utils/builders.js';
import { nextTick, sleep } from '../utils/async.js';

describe('Async Signal functionality', () => {
  test('Can run basic computed', async () => {
    const a = createStateSignal(1);
    const b = createStateSignal(2);

    const c = createAsyncComputedSignal(async () => {
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
    const a = createStateSignal(1);
    const b = createStateSignal(2);

    const c = createAsyncComputedSignal(async () => {
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
    const a = createStateSignal(1);
    const b = createStateSignal(2);

    const c = createAsyncComputedSignal(async () => {
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
    const a = createStateSignal(1);
    const b = createStateSignal(2);

    const c = createAsyncComputedSignal(async () => {
      const result = a.get() + b.get();

      if (result === 4) {
        await sleep(50);
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

    await sleep(100);

    expect(c).toHaveSignalValueAndCounts(result(5, 'success', 'resolved'), {
      compute: 3,
      resolve: 3,
    });
  });

  test('Can have initial value', async () => {
    const a = createStateSignal(1);
    const b = createStateSignal(2);

    const c = createAsyncComputedSignal(
      async () => {
        const result = a.get() + b.get();

        await sleep(50);

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

    await sleep(100);

    expect(c).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
      compute: 1,
      resolve: 1,
    });
  });

  describe('Awaiting', () => {
    test('Awaiting a computed will resolve the value', async () => {
      const compA = createAsyncComputedSignal(async () => {
        await sleep(50);

        return 1;
      });

      const compB = createAsyncComputedSignal(async () => {
        await sleep(100);

        return 2;
      });

      const compC = createAsyncComputedSignal(async () => {
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

      await sleep(100);

      // Check to make sure we don't resolve early after the first task completes
      expect(compC).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 2,
        resolve: 0,
      });

      await sleep(100);

      expect(compC).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
        compute: 3,
        resolve: 1,
      });
    });

    test('Awaiting a computed can handle errors', async () => {
      const compA = createAsyncComputedSignal(async () => {
        await sleep(20);

        throw 'error';
      });

      const compB = createAsyncComputedSignal(async () => {
        await sleep(50);

        return 2;
      });

      const compC = createAsyncComputedSignal(async () => {
        const a = compA.get().await();
        const b = compB.get().await();

        return a + b;
      });

      // Pull once to start the computation, trigger the computation
      expect(compC).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 1,
        resolve: 0,
      });

      await sleep(30);

      expect(compC).toHaveSignalValueAndCounts(result(undefined, 'error', 'initial', 'error'), {
        compute: 2,
        resolve: 0,
      });
    });

    test('Awaiting a computed does not let valid values override errors', async () => {
      const compA = createAsyncComputedSignal(async () => {
        await sleep(10);

        throw 'error';
      });

      const compB = createAsyncComputedSignal(async () => {
        await sleep(50);

        return 2;
      });

      const compC = createAsyncComputedSignal(async () => {
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

      await sleep(100);

      expect(compC).toHaveSignalValueAndCounts(result(undefined, 'error', 'initial', 'error'), {
        compute: 2,
        resolve: 0,
      });
    });

    test('Await can be composed and nested', async () => {
      const compA = createAsyncComputedSignal(
        async () => {
          await sleep(50);
          return 1;
        },
        { desc: 'compA' },
      );

      const compB = createAsyncComputedSignal(
        async () => {
          await sleep(50);
          return 2;
        },
        { desc: 'compB' },
      );

      const compC = createComputedSignal(
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

      const compD = createAsyncComputedSignal(
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

      await sleep(100);

      expect(compD).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
        compute: 2,
        resolve: 1,
      });
    });

    test('Await works with intermediate state', async () => {
      const compA = createAsyncComputedSignal(async () => {
        await sleep(50);
        return 1;
      });

      const compB = createAsyncComputedSignal(async () => {
        await sleep(150);
        return 2;
      });

      const compC = createComputedSignal(() => {
        const resultA = compA.get();
        const resultB = compB.get();

        return {
          awaitA: resultA.await,
          awaitB: resultB.await,
        };
      });

      const compD = createAsyncComputedSignal(async () => {
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

      await sleep(100);

      expect(compD).toHaveSignalValueAndCounts(result(undefined, 'pending', 'initial'), {
        compute: 2,
        resolve: 0,
      });

      await sleep(100);

      expect(compD).toHaveSignalValueAndCounts(result(3, 'success', 'resolved'), {
        compute: 3,
        resolve: 1,
      });
    });
  });
});
