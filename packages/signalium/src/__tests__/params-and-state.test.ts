import { describe, expect, test } from 'vitest';
import { state } from '../index.js';
import { permute } from './utils/permute.js';
import { nextTick } from './utils/async.js';

describe('parameters and state reactivity', () => {
  permute(1, createHook => {
    test('Parameters can be passed to computed', async () => {
      const getC = createHook((a: number, b: number) => {
        return a + b;
      });

      getC.withParams(1, 2)();
      getC.withParams(2, 2)();

      await nextTick();

      expect(getC.withParams(1, 2)).toHaveSignalValue(3).toMatchSnapshot();
      expect(getC.withParams(2, 2)).toHaveSignalValue(4).toMatchSnapshot();
    });

    test('Computed is not recomputed when the same parameters are passed', async () => {
      const getC = createHook((a: number, b: number) => {
        return a + b;
      });

      getC.withParams(1, 2)();

      await nextTick();

      expect(getC.withParams(1, 2)).toHaveSignalValue(3).toMatchSnapshot();
      expect(getC.withParams(1, 2)).toHaveSignalValue(3).toMatchSnapshot();
    });

    test('Computed is recomputed when state changes', async () => {
      const stateValue = state(1);
      const getC = createHook((a: number) => {
        return a + stateValue.get();
      });

      getC.withParams(1)();

      await nextTick();

      expect(getC.withParams(1)).toHaveSignalValue(2).toMatchSnapshot();

      stateValue.set(2);
      await nextTick();

      expect(getC.withParams(1)).toHaveSignalValue(3).toMatchSnapshot();
    });

    test('Computed can return complex objects', async () => {
      const getC = createHook((a: number, b: number) => {
        return {
          sum: a + b,
          product: a * b,
        };
      });

      getC.withParams(2, 3)();

      await nextTick();

      expect(getC.withParams(2, 3))
        .toHaveSignalValue({
          sum: 5,
          product: 6,
        })
        .toMatchSnapshot();

      expect(getC.withParams(2, 3))
        .toHaveSignalValue({
          sum: 5,
          product: 6,
        })
        .toMatchSnapshot();
    });

    test('Computed can take array arguments', async () => {
      const getC = createHook((nums: number[]) => {
        return nums.reduce((a, b) => a + b, 0);
      });

      getC.withParams([1, 2, 3])();
      getC.withParams([4, 5, 6])();

      await nextTick();

      expect(getC.withParams([1, 2, 3]))
        .toHaveSignalValue(6)
        .toMatchSnapshot();
      expect(getC.withParams([1, 2, 3]))
        .toHaveSignalValue(6)
        .toMatchSnapshot();
      expect(getC.withParams([4, 5, 6]))
        .toHaveSignalValue(15)
        .toMatchSnapshot();
    });

    test('Computed can take object arguments', async () => {
      const getC = createHook((obj: { x: number; y: number }) => {
        return obj.x + obj.y;
      });

      getC.withParams({ x: 1, y: 2 })();
      getC.withParams({ x: 3, y: 4 })();

      await nextTick();

      expect(getC.withParams({ x: 1, y: 2 }))
        .toHaveSignalValue(3)
        .toMatchSnapshot();
      expect(getC.withParams({ x: 1, y: 2 }))
        .toHaveSignalValue(3)
        .toMatchSnapshot();
      expect(getC.withParams({ x: 3, y: 4 }))
        .toHaveSignalValue(7)
        .toMatchSnapshot();
    });

    test('Computed memoizes based on deep equality of arguments', async () => {
      const getC = createHook((obj: { x: number; y: number; nested: { a: number; b: number }; arr: number[] }) => {
        return obj.x + obj.y + obj.nested.a + obj.nested.b + obj.arr.reduce((sum, n) => sum + n, 0);
      });

      getC.withParams({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] })();
      getC.withParams({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] })();
      getC.withParams({ x: 2, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] })();
      getC.withParams({ x: 2, y: 2, nested: { a: 3, b: 5 }, arr: [1, 2] })();
      getC.withParams({ x: 2, y: 2, nested: { a: 3, b: 5 }, arr: [2, 2] })();

      await nextTick();

      expect(getC.withParams({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] }))
        .toHaveSignalValue(13)
        .toMatchSnapshot();
      expect(getC.withParams({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] }))
        .toHaveSignalValue(13)
        .toMatchSnapshot();
      expect(getC.withParams({ x: 2, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] }))
        .toHaveSignalValue(14)
        .toMatchSnapshot();
      expect(getC.withParams({ x: 2, y: 2, nested: { a: 3, b: 5 }, arr: [1, 2] }))
        .toHaveSignalValue(15)
        .toMatchSnapshot();
      expect(getC.withParams({ x: 2, y: 2, nested: { a: 3, b: 5 }, arr: [2, 2] }))
        .toHaveSignalValue(16)
        .toMatchSnapshot();
    });

    test('Computed can use custom memoization function', async () => {
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

      getC.withParams({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] })();
      getC.withParams({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] })();
      getC.withParams({ x: 2, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] })();
      getC.withParams({ x: 2, y: 2, nested: { a: 3, b: 5 }, arr: [1, 2] })();
      getC.withParams({ x: 2, y: 2, nested: { a: 3, b: 5 }, arr: [2, 2] })();

      await nextTick();

      expect(getC.withParams({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] }))
        .toHaveSignalValue(13)
        .toMatchSnapshot();
      expect(getC.withParams({ x: 1, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] }))
        .toHaveSignalValue(13)
        .toMatchSnapshot();
      expect(getC.withParams({ x: 2, y: 2, nested: { a: 3, b: 4 }, arr: [1, 2] }))
        .toHaveSignalValue(14)
        .toMatchSnapshot();
      expect(getC.withParams({ x: 2, y: 2, nested: { a: 3, b: 5 }, arr: [1, 2] }))
        .toHaveSignalValue(14)
        .toMatchSnapshot();
      expect(getC.withParams({ x: 2, y: 2, nested: { a: 3, b: 5 }, arr: [2, 2] }))
        .toHaveSignalValue(14)
        .toMatchSnapshot();
    });

    test('Computed can handle undefined arguments', async () => {
      const getC = createHook((a?: number, b?: number) => {
        return (a ?? 0) + (b ?? 0);
      });

      getC.withParams(undefined, 2)();
      getC.withParams(undefined, 2)();
      getC.withParams(1, undefined)();

      await nextTick();

      expect(getC.withParams(undefined, 2)).toHaveSignalValue(2).toMatchSnapshot();
      expect(getC.withParams(undefined, 2)).toHaveSignalValue(2).toMatchSnapshot();
      expect(getC.withParams(1, undefined)).toHaveSignalValue(1).toMatchSnapshot();
    });

    test('Computed can take state as argument and handle updates', async () => {
      const stateValue = state(1);
      const getC = createHook((s: typeof stateValue) => {
        return s.get() * 2;
      });

      getC.withParams(stateValue)();

      await nextTick();

      expect(getC.withParams(stateValue)).toHaveSignalValue(2).toMatchSnapshot();
      expect(getC.withParams(stateValue)).toHaveSignalValue(2).toMatchSnapshot();

      stateValue.set(2);
      await nextTick();

      expect(getC.withParams(stateValue)).toHaveSignalValue(4).toMatchSnapshot();

      stateValue.set(3);
      await nextTick();
      expect(getC.withParams(stateValue)).toHaveSignalValue(6).toMatchSnapshot();
    });
  });
});
