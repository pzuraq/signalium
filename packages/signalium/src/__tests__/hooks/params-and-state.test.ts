import { describe, expect, test } from 'vitest';
import { state } from '../../index.js';
import { permute } from '../utils/permute.js';

describe('parameters and state reactivity', () => {
  permute(1, createHook => {
    test('Parameters can be passed to computed', async () => {
      const getC = createHook((a: number, b: number) => {
        return a + b;
      });

      expect(getC).withParams(1, 2).toHaveValueAndCounts(3, { compute: 1 });
      expect(getC).withParams(2, 2).toHaveValueAndCounts(4, { compute: 2 });
    });

    test('Computed is not recomputed when the same parameters are passed', () => {
      const getC = createHook((a: number, b: number) => {
        return a + b;
      });

      expect(getC).withParams(1, 2).toHaveValueAndCounts(3, { compute: 1 });
      expect(getC).withParams(1, 2).toHaveValueAndCounts(3, { compute: 1 });
    });

    test('Computed is recomputed when state changes', () => {
      const stateValue = state(1);
      const getC = createHook((a: number) => {
        return a + stateValue.get();
      });

      expect(getC).withParams(1).toHaveValueAndCounts(2, { compute: 1 });
      stateValue.set(2);
      expect(getC).withParams(1).toHaveValueAndCounts(3, { compute: 2 });
    });

    test('Computed can return complex objects', () => {
      const getC = createHook((a: number, b: number) => {
        return {
          sum: a + b,
          product: a * b,
        };
      });

      expect(getC).withParams(2, 3).toHaveValueAndCounts(
        {
          sum: 5,
          product: 6,
        },
        { compute: 1 },
      );

      expect(getC).withParams(2, 3).toHaveValueAndCounts(
        {
          sum: 5,
          product: 6,
        },
        { compute: 1 },
      );
    });

    test('Computed can take array arguments', () => {
      const getC = createHook((nums: number[]) => {
        return nums.reduce((a, b) => a + b, 0);
      });

      expect(getC).withParams([1, 2, 3]).toHaveValueAndCounts(6, { compute: 1 });
      expect(getC).withParams([1, 2, 3]).toHaveValueAndCounts(6, { compute: 1 });
      expect(getC).withParams([4, 5, 6]).toHaveValueAndCounts(15, { compute: 2 });
    });

    test('Computed can take object arguments', () => {
      const getC = createHook((obj: { x: number; y: number }) => {
        return obj.x + obj.y;
      });

      expect(getC).withParams({ x: 1, y: 2 }).toHaveValueAndCounts(3, { compute: 1 });
      expect(getC).withParams({ x: 1, y: 2 }).toHaveValueAndCounts(3, { compute: 1 });
      expect(getC).withParams({ x: 3, y: 4 }).toHaveValueAndCounts(7, { compute: 2 });
    });

    test('Computed memoizes based on deep equality of arguments', () => {
      const getC = createHook((obj: { x: number; y: number; nested: { a: number; b: number }; arr: number[] }) => {
        return obj.x + obj.y + obj.nested.a + obj.nested.b + obj.arr.reduce((sum, n) => sum + n, 0);
      });

      expect(getC)
        .withParams({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] })
        .toHaveValueAndCounts(13, { compute: 1 });

      expect(getC)
        .withParams({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] })
        .toHaveValueAndCounts(13, { compute: 1 });

      expect(getC)
        .withParams({ x: 2, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] })
        .toHaveValueAndCounts(14, { compute: 2 });

      expect(getC)
        .withParams({ x: 2, y: 2, nested: { a: 3, b: 5 }, arr: [1, 2] })
        .toHaveValueAndCounts(15, { compute: 3 });

      expect(getC)
        .withParams({ x: 2, y: 2, nested: { a: 3, b: 5 }, arr: [2, 2] })
        .toHaveValueAndCounts(16, { compute: 4 });
    });

    test('Computed can use custom memoization function', () => {
      const getC = createHook(
        (obj: { x: number; y: number; nested: { a: number; b: number }; arr: number[] }) => {
          return obj.x + obj.y + obj.nested.a + obj.nested.b + obj.arr.reduce((sum, n) => sum + n, 0);
        },
        {
          paramKey: obj => {
            return Object.entries(obj)
              .map(([key, value]) => `${key}:${Array.isArray(value) ? 'array' : String(value)}`)
              .join(',');
          },
        },
      );

      expect(getC)
        .withParams({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] })
        .toHaveValueAndCounts(13, { compute: 1 });

      expect(getC)
        .withParams({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] })
        .toHaveValueAndCounts(13, { compute: 1 });

      expect(getC)
        .withParams({ x: 2, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] })
        .toHaveValueAndCounts(14, { compute: 2 });

      expect(getC)
        .withParams({ x: 2, y: 2, nested: { a: 3, b: 5 }, arr: [1, 2] })
        .toHaveValueAndCounts(14, { compute: 2 });

      expect(getC)
        .withParams({ x: 2, y: 2, nested: { a: 3, b: 5 }, arr: [2, 2] })
        .toHaveValueAndCounts(14, { compute: 2 });
    });

    test('Computed can handle undefined arguments', () => {
      const getC = createHook((a?: number, b?: number) => {
        return (a ?? 0) + (b ?? 0);
      });

      expect(getC).withParams(undefined, 2).toHaveValueAndCounts(2, { compute: 1 });
      expect(getC).withParams(undefined, 2).toHaveValueAndCounts(2, { compute: 1 });
      expect(getC).withParams(1, undefined).toHaveValueAndCounts(1, { compute: 2 });
    });

    test('Computed can take state as argument and handle updates', () => {
      const stateValue = state(1);
      const getC = createHook((s: typeof stateValue) => {
        return s.get() * 2;
      });

      expect(getC).withParams(stateValue).toHaveValueAndCounts(2, { compute: 1 });
      expect(getC).withParams(stateValue).toHaveValueAndCounts(2, { compute: 1 });

      stateValue.set(2);
      expect(getC).withParams(stateValue).toHaveValueAndCounts(4, { compute: 2 });

      stateValue.set(3);
      expect(getC).withParams(stateValue).toHaveValueAndCounts(6, { compute: 3 });
    });
  });
});
