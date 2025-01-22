import { describe, expect, test, vi } from 'vitest';
import { state } from '../../index.js';
import { nextTick } from '../utils/async.js';
import { permute } from '../utils/permute.js';

describe('nesting', () => {
  permute(2, (create1, create2) => {
    test('simple nesting', () => {
      const inner = create2((a: number, b: number) => {
        return a + b;
      });

      const outer = create1((a: number) => {
        return inner(a, 2);
      });

      expect(outer).withParams(1).toHaveValueAndCounts(3, { compute: 1 });
      expect(outer).withParams(2).toHaveValueAndCounts(4, { compute: 2 });

      expect(outer).withParams(1).toHaveValueAndCounts(3, { compute: 2 });
      expect(outer).withParams(2).toHaveValueAndCounts(4, { compute: 2 });
    });

    test('outer state + params', () => {
      const val = state(1);

      const inner = create2((a: number, b: number) => {
        return a + b;
      });

      const outer = create1((a: number) => {
        if (a > 1) {
          return inner(a, 2)! + val.get();
        }

        return inner(a, 2);
      });

      expect(outer).withParams(1).toHaveValueAndCounts(3, { compute: 1 });
      expect(outer).withParams(2).toHaveValueAndCounts(5, { compute: 2 });

      val.set(2);
      expect(outer).withParams(1).toHaveValueAndCounts(3, { compute: 2 });
      expect(outer).withParams(2).toHaveValueAndCounts(6, { compute: 3 });
    });

    test('inner state + params', async () => {
      const val = state(1);

      const inner = create2((a: number, b: number) => {
        if (a > 1) {
          return a + b + val.get();
        }

        return a + b;
      });

      const outer = create1((a: number) => {
        return inner(a, 2);
      });

      expect(outer).withParams(1).toHaveValueAndCounts(3, { compute: 1 });
      expect(outer).withParams(2).toHaveValueAndCounts(5, { compute: 2 });

      val.set(2);

      expect(outer).withParams(1).toHaveValueAndCounts(3, { compute: 2 });

      // Wait for async with subscriptions
      await nextTick();

      expect(outer).withParams(2).toHaveValueAndCounts(6, { compute: 3 });
    });
  });

  permute(3, (create1, create2, create3) => {
    test('simple nesting', () => {
      const inner = create3((a: number, b: number, c: number) => {
        return a + b + c;
      });

      const middle = create2((a: number, b: number) => {
        return inner(a, b, 3);
      });

      const outer = create1((a: number) => {
        return middle(a, 2);
      });

      expect(outer).withParams(1).toHaveValueAndCounts(6, { compute: 1 });
    });

    test('state + params one level deep', async () => {
      const val = state(1);

      const inner = create3((a: number, b: number, c: number) => {
        return a + b + c;
      });

      const middle = create2((a: number, b: number) => {
        if (a > 1) {
          return inner(a, b, 3)! + val.get();
        }

        return inner(a, b, 3);
      });

      const outer = create1((a: number) => {
        return middle(a, 2);
      });

      expect(outer).withParams(1).toHaveValueAndCounts(6, { compute: 1 });
      expect(middle).toHaveCounts({ compute: 1 });
      expect(inner).toHaveCounts({ compute: 1 });

      expect(outer).withParams(2).toHaveValueAndCounts(8, { compute: 2 });
      expect(middle).toHaveCounts({ compute: 2 });
      expect(inner).toHaveCounts({ compute: 2 });

      val.set(2);

      expect(outer).withParams(1).toHaveValueAndCounts(6, { compute: 2 });
      expect(middle).toHaveCounts({ compute: 2 });
      expect(inner).toHaveCounts({ compute: 2 });

      // Wait for async with subscriptions
      await nextTick();

      expect(outer).withParams(2).toHaveValueAndCounts(9, { compute: 3 });
      expect(middle).toHaveCounts({ compute: 3 });
      expect(inner).toHaveCounts({ compute: 2 });
    });

    test('state + params two levels deep', async () => {
      const val = state(1);

      const inner = create3((a: number, b: number, c: number) => {
        if (a > 1) {
          return a + b + c + val.get();
        }

        return a + b + c;
      });

      const middle = create2((a: number, b: number) => {
        return inner(a, b, 3);
      });

      const outer = create1((a: number) => {
        return middle(a, 2);
      });

      expect(outer).withParams(1).toHaveValueAndCounts(6, { compute: 1 });
      expect(middle).toHaveCounts({ compute: 1 });
      expect(inner).toHaveCounts({ compute: 1 });

      expect(outer).withParams(2).toHaveValueAndCounts(8, { compute: 2 });
      expect(middle).toHaveCounts({ compute: 2 });
      expect(inner).toHaveCounts({ compute: 2 });

      val.set(2);

      // Wait for async with subscriptions
      await nextTick();

      // Flush all first
      expect(outer).withParams(1).toHaveHookValue(6);
      expect(outer).withParams(2).toHaveHookValue(9);

      // Then check counts
      expect(outer).toHaveCounts({ compute: 3 });
      expect(middle).toHaveCounts({ compute: 3 });
      expect(inner).toHaveCounts({ compute: 3 });
    });

    test('params + multiple children', async () => {
      const inner1 = create3((a: number, b: number, c: number) => {
        return a + b + c;
      });

      const inner2 = create2((a: number, b: number) => {
        return a + b + inner1(a, b, 3)!;
      });

      const outer = create1((a: number, b: number) => {
        return inner1(a, 2, 3)! + inner2(b, 2)!;
      });

      expect(outer).withParams(1, 2).toHaveValueAndCounts(17, { compute: 1 });
      expect(outer).withParams(1, 2).toHaveValueAndCounts(17, { compute: 1 });
      expect(inner1).toHaveCounts({ compute: 2 });
      expect(inner2).toHaveCounts({ compute: 1 });

      expect(outer).withParams(2, 2).toHaveValueAndCounts(18, { compute: 2 });
      expect(outer).withParams(2, 2).toHaveValueAndCounts(18, { compute: 2 });
      expect(inner1).toHaveCounts({ compute: 2 });
      expect(inner2).toHaveCounts({ compute: 1 });

      expect(outer).withParams(2, 3).toHaveValueAndCounts(20, { compute: 3 });
      expect(outer).withParams(2, 3).toHaveValueAndCounts(20, { compute: 3 });
      expect(inner1).toHaveCounts({ compute: 3 });
      expect(inner2).toHaveCounts({ compute: 2 });
    });

    test('params + state + multiple children', async () => {
      const val = state(1);

      const inner1 = create3((a: number, b: number, c: number) => {
        return a + b + c;
      });

      const inner2 = create2((a: number, b: number) => {
        if (a > 1) {
          return a + b + inner1(a, b, 3)! + val.get();
        }

        return a + b + inner1(a, b, 3)!;
      });

      const outer = create1((a: number, b: number) => {
        return inner1(a, 2, 3)! + inner2(b, 2)!;
      });

      expect(outer).withParams(1, 2).toHaveValueAndCounts(18, { compute: 1 });
      expect(inner1).toHaveCounts({ compute: 2 });
      expect(inner2).toHaveCounts({ compute: 1 });

      expect(outer).withParams(2, 2).toHaveValueAndCounts(19, { compute: 2 });
      expect(inner1).toHaveCounts({ compute: 2 });
      expect(inner2).toHaveCounts({ compute: 1 });

      expect(outer).withParams(2, 3).toHaveValueAndCounts(21, { compute: 3 });
      expect(inner1).toHaveCounts({ compute: 3 });
      expect(inner2).toHaveCounts({ compute: 2 });

      expect(outer).withParams(3, 3).toHaveValueAndCounts(22, { compute: 4 });
      expect(inner1).toHaveCounts({ compute: 3 });
      expect(inner2).toHaveCounts({ compute: 2 });

      val.set(2);

      // Wait for async with subscriptions
      await nextTick();

      // Flush all first
      expect(outer).withParams(1, 2).toHaveHookValue(19);
      expect(outer).withParams(2, 2).toHaveHookValue(20);
      expect(outer).withParams(2, 3).toHaveHookValue(22);
      expect(outer).withParams(3, 3).toHaveHookValue(23);

      // Then check counts
      expect(outer).toHaveCounts({ compute: 8 });
      expect(inner1).toHaveCounts({ compute: 3 });
      expect(inner2).toHaveCounts({ compute: 4 });
    });

    test('passing state as params + multiple children', async () => {
      const stateA = state(1);
      const stateB = state(2);

      const inner1 = create2((a: number, s: typeof stateA) => {
        return a + s.get();
      });

      const inner2 = create3((b: number, s: typeof stateB) => {
        return b * s.get();
      });

      const outer = create1((x: number) => {
        if (x > 2) {
          return inner1(x, stateA)! + inner2(x, stateB)!;
        }
        return inner1(x, stateA);
      });

      expect(outer).withParams(1).toHaveValueAndCounts(2, { compute: 1 });
      expect(inner1).toHaveCounts({ compute: 1 });
      expect(inner2).toHaveCounts({ compute: 0 });

      expect(outer).withParams(3).toHaveValueAndCounts(10, { compute: 2 });
      expect(inner1).toHaveCounts({ compute: 2 });
      expect(inner2).toHaveCounts({ compute: 1 });

      stateA.set(2);
      await nextTick();

      expect(outer).withParams(1).toHaveHookValue(3);
      expect(outer).withParams(3).toHaveHookValue(11);
      expect(outer).toHaveCounts({ compute: 4 });
      expect(inner1).toHaveCounts({ compute: 4 });
      expect(inner2).toHaveCounts({ compute: 1 });

      stateB.set(3);

      await nextTick();
      expect(outer).withParams(1).toHaveHookValue(3);
      expect(outer).withParams(3).toHaveHookValue(14);
      expect(outer).toHaveCounts({ compute: 5 });
      expect(inner1).toHaveCounts({ compute: 4 });
      expect(inner2).toHaveCounts({ compute: 2 });
    });
  });
});
