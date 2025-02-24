import { describe, expect, test } from 'vitest';
import { state } from '../../index.js';
import { asyncComputed } from '../utils/instrumented-hooks.js';
import { nextTick } from '../utils/async.js';

describe('async computeds', () => {
  test('Basic async computed works', async () => {
    const getC = asyncComputed(async (a: number, b: number) => {
      return a + b;
    });

    const result1 = getC(1, 2);
    expect(result1.isPending).toBe(true);
    expect(result1.result).toBe(undefined);
    await nextTick();
    expect(result1.isSuccess).toBe(true);
    expect(result1.result).toBe(3);

    const result2 = getC(2, 2);
    expect(result2.isPending).toBe(true);
    expect(result2.result).toBe(undefined);
    await nextTick();
    expect(result2.isSuccess).toBe(true);
    expect(result2.result).toBe(4);
  });

  test('Async computed is not recomputed when the same arguments are passed', async () => {
    let computeCount = 0;
    const getC = asyncComputed(async (a: number, b: number) => {
      computeCount++;
      return a + b;
    });

    const result1 = getC(1, 2);
    await nextTick();
    expect(result1.result).toBe(3);
    expect(computeCount).toBe(1);

    const result2 = getC(1, 2);
    await nextTick();
    expect(result2.result).toBe(3);
    expect(computeCount).toBe(1);
  });

  test('Async computed is recomputed when the arguments change', async () => {
    let computeCount = 0;
    const getC = asyncComputed(async (a: number, b: number) => {
      computeCount++;
      return a + b;
    });

    const result1 = getC(1, 2);
    await nextTick();
    expect(result1.result).toBe(3);
    expect(computeCount).toBe(1);

    const result2 = getC(2, 2);
    await nextTick();
    expect(result2.result).toBe(4);
    expect(computeCount).toBe(2);
  });

  test('Async computed is recomputed when state changes', async () => {
    let computeCount = 0;
    const stateValue = state(1);

    const getC = asyncComputed(async (a: number) => {
      computeCount++;
      return a + stateValue.get();
    });

    const result1 = getC(1);
    await nextTick();
    expect(result1.result).toBe(2);
    expect(computeCount).toBe(1);

    stateValue.set(2);
    const result2 = getC(1);
    await nextTick();
    expect(result2.result).toBe(3);
    expect(computeCount).toBe(2);
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

  test('Async computed with init value starts ready', () => {
    const getC = asyncComputed(async () => 'updated', { initValue: 'initial' });

    const result = getC();
    expect(result.isReady).toBe(true);
    expect(result.result).toBe('initial');
    expect(result.isPending).toBe(true);
  });

  test('Nested async computeds work correctly', async () => {
    let innerCount = 0;
    let outerCount = 0;

    const inner = asyncComputed(async (x: number) => {
      innerCount++;
      await nextTick();
      return x * 2;
    });

    const outer = asyncComputed(async (x: number) => {
      outerCount++;
      const innerResult = inner(x);
      const result = innerResult.await();
      return result + 1;
    });

    const result1 = outer(2);
    expect(result1.result).toBe(undefined);
    expect(innerCount).toBe(1);
    expect(outerCount).toBe(1);

    await new Promise(resolve => setTimeout(resolve, 10));
    const result2 = outer(2);
    expect(result2.result).toBe(5);
    expect(innerCount).toBe(1);
    expect(outerCount).toBe(2);
  });

  test('Nested async computeds handle errors correctly', async () => {
    const inner = asyncComputed(async (shouldError: boolean) => {
      if (shouldError) throw new Error('Inner error');
      await nextTick();
      return 'inner success';
    });

    const outer = asyncComputed(async (shouldError: boolean) => {
      const innerResult = inner(shouldError);
      await innerResult.await();
      return 'outer: ' + innerResult.result;
    });

    // Test success case
    const successResult = outer(false);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(successResult.isSuccess).toBe(true);
    expect(successResult.result).toBe('outer: inner success');

    // Test error case
    const errorResult = outer(true);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(errorResult.isError).toBe(true);
    expect(errorResult.error).toBeInstanceOf(Error);
    expect((errorResult.error as Error).message).toBe('Inner error');
  });

  test('Nested async computeds with init values work correctly', async () => {
    const inner = asyncComputed(async (x: number) => x * 2, { initValue: 0 });
    const outer = asyncComputed(
      async (x: number) => {
        const innerResult = inner(x);
        await innerResult.await();
        return innerResult.result! + 1;
      },
      { initValue: -1 },
    );

    const result = outer(2);
    expect(result.isReady).toBe(true);
    expect(result.result).toBe(-1); // Initial value
    expect(result.isPending).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(result.result).toBe(5); // (2 * 2) + 1
    expect(result.isPending).toBe(false);
    expect(result.isSuccess).toBe(true);
  });
});
