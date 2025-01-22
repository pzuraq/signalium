import { describe, expect, test } from 'vitest';
import { asyncComputed, asyncTask, computed } from '../utils/instrumented-hooks.js';
import { nextTick } from '../utils/async.js';

describe('async tasks', () => {
  test('Basic async task works', async () => {
    const getC = asyncTask(async (a: number, b: number) => {
      return a + b;
    });

    // First set of args
    const task1 = getC(1, 2);
    expect(task1.isPending).toBe(false);
    expect(task1.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 0 });

    await nextTick();
    expect(task1.isPending).toBe(false);
    expect(task1.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 0 });

    const result1 = task1.run();
    expect(task1.isPending).toBe(true);
    expect(task1.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 1 });

    expect(await result1).toBe(3);
    expect(task1.isSuccess).toBe(true);
    expect(task1.result).toBe(3);
    expect(getC).toHaveCounts({ compute: 1 });

    const result2 = task1.run();
    expect(task1.isPending).toBe(true);
    expect(task1.result).toBe(3);
    expect(getC).toHaveCounts({ compute: 2 });

    expect(await result2).toBe(3);
    expect(task1.isSuccess).toBe(true);
    expect(task1.result).toBe(3);
    expect(getC).toHaveCounts({ compute: 2 });

    // Second set of args
    const task2 = getC(2, 2);
    expect(task2.isPending).toBe(false);
    expect(task2.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 2 });

    await nextTick();
    expect(task2.isPending).toBe(false);
    expect(task2.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 2 });

    const result3 = task2.run();
    expect(task2.isPending).toBe(true);
    expect(task2.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 3 });

    expect(await result3).toBe(4);
    expect(task2.isSuccess).toBe(true);
    expect(task2.result).toBe(4);
    expect(getC).toHaveCounts({ compute: 3 });

    const result4 = task2.run();
    expect(task2.isPending).toBe(true);
    expect(task2.result).toBe(4);
    expect(getC).toHaveCounts({ compute: 4 });

    expect(await result4).toBe(4);
    expect(task2.isSuccess).toBe(true);
    expect(task2.result).toBe(4);
    expect(getC).toHaveCounts({ compute: 4 });
  });

  test('Separate tasks are created for different arguments', async () => {
    const getC = asyncTask(async (a: number, b: number) => {
      return a + b;
    });

    const task1 = getC(1, 2);
    const task2 = getC(2, 2);

    expect(task1.isPending).toBe(false);
    expect(task1.result).toBe(undefined);
    expect(task2.isPending).toBe(false);
    expect(task2.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 0 });

    await nextTick();
    expect(task1.isPending).toBe(false);
    expect(task1.result).toBe(undefined);
    expect(task2.isPending).toBe(false);
    expect(task2.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 0 });

    const result1 = task1.run();
    expect(task1.isPending).toBe(true);
    expect(task1.result).toBe(undefined);
    expect(task2.isPending).toBe(false);
    expect(task2.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 1 });

    expect(await result1).toBe(3);
    expect(task1.isSuccess).toBe(true);
    expect(task1.result).toBe(3);
    expect(task2.isPending).toBe(false);
    expect(task2.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 1 });

    const result2 = task2.run();
    expect(task2.isPending).toBe(true);
    expect(task2.result).toBe(undefined);
    expect(task1.isPending).toBe(false);
    expect(task1.result).toBe(3);
    expect(getC).toHaveCounts({ compute: 2 });

    expect(await result2).toBe(4);
    expect(task1.isPending).toBe(false);
    expect(task1.result).toBe(3);
    expect(task2.isSuccess).toBe(true);
    expect(task2.result).toBe(4);
    expect(getC).toHaveCounts({ compute: 2 });
  });

  test('Separate tasks notify separately', async () => {
    const getC = asyncTask(async (a: number, b: number) => {
      return a + b;
    });

    const computed1 = computed(() => getC(1, 2));
    const computed2 = computed(() => getC(2, 2));

    const task1 = computed1();
    const task2 = computed2();

    expect(task1.isPending).toBe(false);
    expect(task1.result).toBe(undefined);
    expect(task2.isPending).toBe(false);
    expect(task2.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 0 });
    expect(computed1).toHaveCounts({ compute: 1 });
    expect(computed2).toHaveCounts({ compute: 1 });

    await nextTick();
    expect(task1.isPending).toBe(false);
    expect(task1.result).toBe(undefined);
    expect(task2.isPending).toBe(false);
    expect(task2.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 0 });
    expect(computed1).toHaveCounts({ compute: 1 });
    expect(computed2).toHaveCounts({ compute: 1 });

    const result1 = task1.run();

    computed1();
    computed2();

    expect(task1.isPending).toBe(true);
    expect(task1.result).toBe(undefined);
    expect(task2.isPending).toBe(false);
    expect(task2.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 1 });
    expect(computed1).toHaveCounts({ compute: 2 });
    expect(computed2).toHaveCounts({ compute: 1 });

    computed1();
    computed2();

    expect(await result1).toBe(3);
    expect(task1.isSuccess).toBe(true);
    expect(task1.result).toBe(3);
    expect(task2.isPending).toBe(false);
    expect(task2.result).toBe(undefined);
    expect(getC).toHaveCounts({ compute: 1 });

    computed1();
    computed2();

    expect(computed1).toHaveCounts({ compute: 3 });
    expect(computed2).toHaveCounts({ compute: 1 });

    const result2 = task2.run();
    expect(task2.isPending).toBe(true);
    expect(task2.result).toBe(undefined);
    expect(task1.isPending).toBe(false);
    expect(task1.result).toBe(3);
    expect(getC).toHaveCounts({ compute: 2 });

    computed1();
    computed2();

    expect(computed1).toHaveCounts({ compute: 3 });
    expect(computed2).toHaveCounts({ compute: 2 });

    expect(await result2).toBe(4);
    expect(task1.isPending).toBe(false);
    expect(task1.result).toBe(3);
    expect(task2.isSuccess).toBe(true);
    expect(task2.result).toBe(4);
    expect(getC).toHaveCounts({ compute: 2 });

    computed1();
    computed2();

    expect(computed1).toHaveCounts({ compute: 3 });
    expect(computed2).toHaveCounts({ compute: 3 });
  });

  test('Async computed handles errors', async () => {
    const getC = asyncComputed(async (shouldError: boolean) => {
      if (shouldError) {
        throw new Error('Test error');
      }
      return 'success';
    });

    const result1 = getC(false);
    await nextTick();
    expect(result1.isSuccess).toBe(true);
    expect(result1.result).toBe('success');

    const result2 = getC(true);
    await nextTick();
    expect(result2.isError).toBe(true);
    expect(result2.error as Error).toBeInstanceOf(Error);
    expect((result2.error as Error).message).toBe('Test error');
  });
});
