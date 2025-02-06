import { describe, expect, test } from 'vitest';
import { createComputed, ROOT_SCOPE } from '../context.js';
import { state } from 'signalium';

describe.skip('computeds', () => {
  test('Basic computed works', () => {
    const getC = createComputed((a: number, b: number) => {
      return a + b;
    });

    const result1 = getC(1, 2);
    expect(result1).toBe(3);

    const result2 = getC(2, 2);
    expect(result2).toBe(4);
  });

  test('Computed is not recomputed when the same arguments are passed', () => {
    let computeCount = 0;
    const getC = createComputed((a: number, b: number) => {
      computeCount++;
      return a + b;
    });

    const result1 = getC(1, 2);
    expect(result1).toBe(3);
    expect(computeCount).toBe(1);

    const result2 = getC(1, 2);
    expect(result2).toBe(3);
    expect(computeCount).toBe(1);
  });

  test('Computed is recomputed when the arguments change', () => {
    let computeCount = 0;
    const getC = createComputed((a: number, b: number) => {
      computeCount++;
      return a + b;
    });

    const result1 = getC(1, 2);
    expect(result1).toBe(3);
    expect(computeCount).toBe(1);

    const result2 = getC(2, 2);
    expect(result2).toBe(4);
    expect(computeCount).toBe(2);
  });

  test('Computed is recomputed when state changes', () => {
    let computeCount = 0;
    const stateValue = state(1);

    const getC = createComputed((a: number) => {
      computeCount++;
      return a + stateValue.get();
    });

    const result1 = getC(1);
    expect(result1).toBe(2);
    expect(computeCount).toBe(1);

    stateValue.set(2);
    const result2 = getC(1);
    expect(result2).toBe(3);
    expect(computeCount).toBe(2);
  });

  test('Computed is recomputed when the arguments change', () => {
    let computeCount = 0;
    const getC = createComputed((a: number, b: number) => {
      computeCount++;
      return a + b;
    });

    const result1 = getC(1, 2);
    expect(result1).toBe(3);
    expect(computeCount).toBe(1);

    const result2 = getC(2, 2);
    expect(result2).toBe(4);
    expect(computeCount).toBe(2);
  });

  test('Computed can return complex objects', () => {
    let computeCount = 0;
    const getC = createComputed((a: number, b: number) => {
      computeCount++;
      return {
        sum: a + b,
        product: a * b,
      };
    });

    const result1 = getC(2, 3);
    expect(result1).toEqual({
      sum: 5,
      product: 6,
    });
    expect(computeCount).toBe(1);

    const result2 = getC(2, 3);
    expect(result2).toEqual({
      sum: 5,
      product: 6,
    });
    expect(computeCount).toBe(1);
  });

  test('Computed can take array arguments', () => {
    let computeCount = 0;
    const getC = createComputed((nums: number[]) => {
      computeCount++;
      return nums.reduce((a, b) => a + b, 0);
    });

    const result1 = getC([1, 2, 3]);
    expect(result1).toBe(6);
    expect(computeCount).toBe(1);

    const result2 = getC([1, 2, 3]);
    expect(result2).toBe(6);
    expect(computeCount).toBe(1);

    const result3 = getC([4, 5, 6]);
    expect(result3).toBe(15);
    expect(computeCount).toBe(2);
  });

  test('Computed can take object arguments', () => {
    let computeCount = 0;
    const getC = createComputed((obj: { x: number; y: number }) => {
      computeCount++;
      return obj.x + obj.y;
    });

    const result1 = getC({ x: 1, y: 2 });
    expect(result1).toBe(3);
    expect(computeCount).toBe(1);

    const result2 = getC({ x: 1, y: 2 });
    expect(result2).toBe(3);
    expect(computeCount).toBe(1);

    const result3 = getC({ x: 3, y: 4 });
    expect(result3).toBe(7);
    expect(computeCount).toBe(2);
  });

  test('Computed memoizes based on deep equality of arguments', () => {
    let computeCount = 0;
    const getC = createComputed((obj: { x: number; y: number; nested: { a: number; b: number }; arr: number[] }) => {
      computeCount++;
      return obj.x + obj.y + obj.nested.a + obj.nested.b + obj.arr.reduce((sum, n) => sum + n, 0);
    });

    const result1 = getC({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] });
    expect(result1).toBe(13); // 1 + 2 + 3 + 4 + (1 + 2) = 13
    expect(computeCount).toBe(1);

    const result2 = getC({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] });
    expect(result2).toBe(13);
    expect(computeCount).toBe(1);

    const result3 = getC({ x: 2, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] });
    expect(result3).toBe(14); // 2 + 2 + 3 + 4 + (1 + 2) = 14
    expect(computeCount).toBe(2);
  });

  test('Computed can handle undefined arguments', () => {
    let computeCount = 0;
    const getC = createComputed((a?: number, b?: number) => {
      computeCount++;
      return (a ?? 0) + (b ?? 0);
    });

    const result1 = getC(undefined, 2);
    expect(result1).toBe(2);
    expect(computeCount).toBe(1);

    const result2 = getC(undefined, 2);
    expect(result2).toBe(2);
    expect(computeCount).toBe(1);

    const result3 = getC(1, undefined);
    expect(result3).toBe(1);
    expect(computeCount).toBe(2);
  });

  test('Computed can throw errors', () => {
    let computeCount = 0;
    const getC = createComputed((a: number) => {
      computeCount++;
      if (a < 0) throw new Error('negative number');
      return a * 2;
    });

    const result1 = getC(2);
    expect(result1).toBe(4);
    expect(computeCount).toBe(1);

    expect(() => getC(-1)).toThrow('negative number');
    expect(computeCount).toBe(2);
  });

  describe('nesting behavior', () => {
    test('Nested computeds work', () => {
      let outerCount = 0;
      let innerCount = 0;

      const getInner = createComputed((a: number, b: number) => {
        innerCount++;
        return a + b;
      });

      const getOuter = createComputed((x: number) => {
        outerCount++;
        return getInner(x, 2) * 2;
      });

      const result1 = getOuter(1);
      expect(result1).toBe(6); // (1 + 2) * 2 = 6
      expect(outerCount).toBe(1);
      expect(innerCount).toBe(1);

      const result2 = getOuter(1);
      expect(result2).toBe(6);
      expect(outerCount).toBe(1);
      expect(innerCount).toBe(1);

      const result3 = getOuter(2);
      expect(result3).toBe(8); // (2 + 2) * 2 = 8
      expect(outerCount).toBe(2);
      expect(innerCount).toBe(2);
    });

    test('Nested computeds with shared state', () => {
      const sharedState = state(1);
      let outerCount = 0;
      let innerCount = 0;

      const getInner = createComputed((a: number) => {
        innerCount++;
        return a + sharedState.get();
      });

      const getOuter = createComputed((x: number) => {
        outerCount++;
        return getInner(x) * 2;
      });

      const result1 = getOuter(1);
      expect(result1).toBe(4); // (1 + 1) * 2 = 4
      expect(outerCount).toBe(1);
      expect(innerCount).toBe(1);

      sharedState.set(2);
      const result2 = getOuter(1);
      expect(result2).toBe(6); // (1 + 2) * 2 = 6
      expect(outerCount).toBe(2);
      expect(innerCount).toBe(2);
    });

    test('Deeply nested computeds maintain independence', () => {
      let counts = { a: 0, b: 0, c: 0 };

      const getA = createComputed((x: number) => {
        counts.a++;
        return x + 1;
      });

      const getB = createComputed((x: number) => {
        counts.b++;
        return getA(x) * 2 + getA(x * 2);
      });

      const getC = createComputed((x: number) => {
        counts.c++;
        return getB(x) + getA(x);
      });

      const result1 = getC(1);
      expect(result1).toBe(9); // (((1 + 1) * 2) + (1 + 1)) + (1 + 1) = ((2 * 2) + 2) + 2 = 9
      expect(counts).toEqual({ a: 2, b: 1, c: 1 });

      const result2 = getC(1);
      expect(result2).toBe(9);
      expect(counts).toEqual({ a: 2, b: 1, c: 1 });

      const result3 = getC(2);
      expect(result3).toBe(14); // (((2 + 1) * 2) + (2 + 1)) + (2 + 1) = ((3 * 2) + 3) + 3 = 14

      expect(counts).toEqual({ a: 3, b: 2, c: 2 });
    });

    test('Nested computeds work with state signals', () => {
      const stateA = state(1);
      const stateB = state(2);
      let counts = { inner: 0, outer: 0 };

      const getInner = createComputed((x: number) => {
        counts.inner++;
        return x + stateA.get();
      });

      const getOuter = createComputed((x: number) => {
        counts.outer++;
        return getInner(x) * stateB.get();
      });

      const result1 = getOuter(3);
      expect(result1).toBe(8); // (3 + 1) * 2 = 8
      expect(counts).toEqual({ inner: 1, outer: 1 });

      stateA.set(2);
      const result2 = getOuter(3);
      expect(result2).toBe(10); // (3 + 2) * 2 = 10
      expect(counts).toEqual({ inner: 2, outer: 2 });

      stateB.set(3);
      const result3 = getOuter(3);
      expect(result3).toBe(15); // (3 + 2) * 3 = 15
      expect(counts).toEqual({ inner: 2, outer: 3 });

      // Same inputs should not cause recomputation
      const result4 = getOuter(3);
      expect(result4).toBe(15);
      expect(counts).toEqual({ inner: 2, outer: 3 });
    });

    test('Nested computeds work with both state and arguments', () => {
      const stateA = state(1);
      const stateB = state(2);
      let counts = { inner: 0, middle: 0, outer: 0 };

      const getInner = createComputed((x: number, y: number) => {
        counts.inner++;
        return x + y + stateA.get();
      });

      const getMiddle = createComputed((x: number) => {
        counts.middle++;
        return getInner(x, stateB.get()) * 2;
      });

      const getOuter = createComputed((x: number, y: number) => {
        counts.outer++;
        return getMiddle(x) + y;
      });

      const result1 = getOuter(1, 3);
      expect(result1).toBe(11); // ((1 + 2 + 1) * 2) + 3 = (4 * 2) + 3 = 11
      expect(counts).toEqual({ inner: 1, middle: 1, outer: 1 });

      // Change argument to inner via stateB
      stateB.set(3);
      const result2 = getOuter(1, 3);
      expect(result2).toBe(13); // ((1 + 3 + 1) * 2) + 3 = (5 * 2) + 3 = 13
      expect(counts).toEqual({ inner: 2, middle: 2, outer: 2 });

      // Change state affecting inner
      stateA.set(2);
      const result3 = getOuter(1, 3);
      expect(result3).toBe(15); // ((1 + 3 + 2) * 2) + 3 = (6 * 2) + 3 = 15
      expect(counts).toEqual({ inner: 3, middle: 3, outer: 3 });

      // Change outer argument only
      const result4 = getOuter(1, 4);
      expect(result4).toBe(16); // ((1 + 3 + 2) * 2) + 4 = (6 * 2) + 4 = 16
      expect(counts).toEqual({ inner: 3, middle: 3, outer: 4 });

      // Same inputs should not cause recomputation
      const result5 = getOuter(1, 4);
      expect(result5).toBe(16);
      expect(counts).toEqual({ inner: 3, middle: 3, outer: 4 });
    });
  });
});
