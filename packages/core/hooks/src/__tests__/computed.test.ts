import { describe, expect, test } from 'vitest';
import { state } from 'signalium';
import { createComputed } from './utils/instrumented';

describe('computeds', () => {
  test('Basic computed works', () => {
    const getC = createComputed((a: number, b: number) => {
      return a + b;
    });

    expect(getC).withParams(1, 2).toHaveValueAndCounts(3, { compute: 1 });
    expect(getC).withParams(2, 2).toHaveValueAndCounts(4, { compute: 2 });
  });

  test('Computed can throw errors', () => {
    const getC = createComputed((a: number) => {
      if (a < 0) throw new Error('negative number');
      return a * 2;
    });

    expect(getC).withParams(2).toHaveValueAndCounts(4, { compute: 1 });
    expect(() => getC(-1)).toThrow('negative number');
  });

  describe('nesting behavior', () => {
    test('Nested computeds work', () => {
      const getInner = createComputed((a: number, b: number) => {
        return a + b;
      });

      const getOuter = createComputed((x: number) => {
        return getInner(x, 2) * 2;
      });

      expect(getOuter).withParams(1).toHaveValueAndCounts(6, { compute: 1 });
      expect(getOuter).withParams(1).toHaveValueAndCounts(6, { compute: 1 });
      expect(getOuter).withParams(2).toHaveValueAndCounts(8, { compute: 2 });
    });

    test('Nested computeds with shared state', () => {
      const sharedState = state(1);

      const getInner = createComputed((a: number) => {
        return a + sharedState.get();
      });

      const getOuter = createComputed((x: number) => {
        return getInner(x) * 2;
      });

      expect(getOuter).withParams(1).toHaveValueAndCounts(4, { compute: 1 });
      sharedState.set(2);
      expect(getOuter).withParams(1).toHaveValueAndCounts(6, { compute: 2 });
    });

    test('Deeply nested computeds maintain independence', () => {
      const getA = createComputed((x: number) => {
        return x + 1;
      });

      const getB = createComputed((x: number) => {
        return getA(x) * 2 + getA(x * 2);
      });

      const getC = createComputed((x: number) => {
        return getB(x) + getA(x);
      });

      expect(getC).withParams(1).toHaveValueAndCounts(9, { compute: 1 });
      expect(getC).withParams(1).toHaveValueAndCounts(9, { compute: 1 });
      expect(getC).withParams(2).toHaveValueAndCounts(14, { compute: 2 });
    });

    test('Nested computeds work with state signals', () => {
      const stateA = state(1);
      const stateB = state(2);

      const getInner = createComputed((x: number) => {
        return x + stateA.get();
      });

      const getOuter = createComputed((x: number) => {
        return getInner(x) * stateB.get();
      });

      expect(getOuter).withParams(3).toHaveValueAndCounts(8, { compute: 1 });

      stateA.set(2);
      expect(getOuter).withParams(3).toHaveValueAndCounts(10, { compute: 2 });

      stateB.set(3);
      expect(getOuter).withParams(3).toHaveValueAndCounts(15, { compute: 3 });

      expect(getOuter).withParams(3).toHaveValueAndCounts(15, { compute: 3 });
    });

    test('Nested computeds work with both state and arguments', () => {
      const stateA = state(1);
      const stateB = state(2);

      const getInner = createComputed((x: number, y: number) => {
        return x + y + stateA.get();
      });

      const getMiddle = createComputed((x: number) => {
        return getInner(x, stateB.get()) * 2;
      });

      const getOuter = createComputed((x: number, y: number) => {
        return getMiddle(x) + y;
      });

      expect(getOuter).withParams(1, 3).toHaveValueAndCounts(11, { compute: 1 });

      stateB.set(3);
      expect(getOuter).withParams(1, 3).toHaveValueAndCounts(13, { compute: 2 });

      stateA.set(2);
      expect(getOuter).withParams(1, 3).toHaveValueAndCounts(15, { compute: 3 });

      expect(getOuter).withParams(1, 4).toHaveValueAndCounts(16, { compute: 4 });

      expect(getOuter).withParams(1, 4).toHaveValueAndCounts(16, { compute: 4 });
    });
  });
});
