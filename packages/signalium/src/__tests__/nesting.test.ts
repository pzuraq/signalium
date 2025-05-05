import { describe, expect, test, vi } from 'vitest';
import { state } from '../index.js';
import { nextTick } from './utils/async.js';
import { permute } from './utils/permute.js';

describe('nesting', () => {
  permute(2, (create1, create2) => {
    test('simple nesting', async () => {
      const inner = create2(
        (a: number, b: number) => {
          return a + b;
        },
        {
          desc: 'inner',
        },
      );

      const outer = create1(
        (a: number) => {
          return inner(a, 2);
        },
        {
          desc: 'outer',
        },
      );

      outer.withParams(1).watch();
      outer.withParams(2).watch();

      await nextTick();

      expect(outer.withParams(1)).toHaveSignalValue(3).toMatchSnapshot();
      expect(outer.withParams(2)).toHaveSignalValue(4).toMatchSnapshot();

      expect(outer.withParams(1)).toHaveSignalValue(3).toMatchSnapshot();
      expect(outer.withParams(2)).toHaveSignalValue(4).toMatchSnapshot();
    });

    test('outer state + params', async () => {
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

      outer.withParams(1).watch();
      outer.withParams(2).watch();

      await nextTick();

      expect(outer.withParams(1)).toHaveSignalValue(3).toMatchSnapshot();
      expect(outer.withParams(2)).toHaveSignalValue(5).toMatchSnapshot();

      val.set(2);
      await nextTick();

      expect(outer.withParams(1)).toHaveSignalValue(3).toMatchSnapshot();
      expect(outer.withParams(2)).toHaveSignalValue(6).toMatchSnapshot();
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

      outer.withParams(1).watch();
      outer.withParams(2).watch();

      await nextTick();

      expect(outer.withParams(1)).toHaveSignalValue(3).toMatchSnapshot();
      expect(outer.withParams(2)).toHaveSignalValue(5).toMatchSnapshot();

      val.set(2);

      await nextTick();

      expect(outer.withParams(1)).toHaveSignalValue(3).toMatchSnapshot();
      expect(outer.withParams(2)).toHaveSignalValue(6).toMatchSnapshot();
    });
  });

  permute(3, (create1, create2, create3) => {
    test('simple nesting', async () => {
      const inner = create3((a: number, b: number, c: number) => {
        return a + b + c;
      });

      const middle = create2((a: number, b: number) => {
        return inner(a, b, 3);
      });

      const outer = create1((a: number) => {
        return middle(a, 2);
      });

      outer.withParams(1).watch();

      await nextTick();

      expect(outer.withParams(1)).toHaveSignalValue(6).toMatchSnapshot();
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

      outer.withParams(1).watch();
      outer.withParams(2).watch();

      await nextTick();

      expect(outer.withParams(1)).toHaveSignalValue(6).toMatchSnapshot();
      expect(outer.withParams(2)).toHaveSignalValue(8).toMatchSnapshot();

      val.set(2);
      await nextTick();

      expect(outer.withParams(1)).toHaveSignalValue(6).toMatchSnapshot();
      expect(outer.withParams(2)).toHaveSignalValue(9).toMatchSnapshot();
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

      outer.withParams(1).watch();
      outer.withParams(2).watch();

      await nextTick();

      expect(outer.withParams(1)).toHaveSignalValue(6).toMatchSnapshot();
      expect(outer.withParams(2)).toHaveSignalValue(8).toMatchSnapshot();

      val.set(2);

      await nextTick();

      expect(outer.withParams(1)).toHaveSignalValue(6).toMatchSnapshot();
      expect(outer.withParams(2)).toHaveSignalValue(9).toMatchSnapshot();
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

      outer.withParams(1, 2).watch();
      outer.withParams(2, 2).watch();
      outer.withParams(2, 3).watch();

      await nextTick();
      await nextTick();

      expect(outer.withParams(1, 2)).toHaveSignalValue(17).toMatchSnapshot();
      expect(outer.withParams(2, 2)).toHaveSignalValue(18).toMatchSnapshot();
      expect(outer.withParams(2, 3)).toHaveSignalValue(20).toMatchSnapshot();
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

      outer.withParams(1, 2).watch();
      outer.withParams(2, 2).watch();
      outer.withParams(2, 3).watch();
      outer.withParams(3, 3).watch();

      await nextTick();

      expect(outer.withParams(1, 2)).toHaveSignalValue(18).toMatchSnapshot();
      expect(outer.withParams(2, 2)).toHaveSignalValue(19).toMatchSnapshot();
      expect(outer.withParams(2, 3)).toHaveSignalValue(21).toMatchSnapshot();
      expect(outer.withParams(3, 3)).toHaveSignalValue(22).toMatchSnapshot();

      val.set(2);

      // Wait for async with subscriptions
      await nextTick();

      expect(outer.withParams(1, 2)).toHaveSignalValue(19).toMatchSnapshot();
      expect(outer.withParams(2, 2)).toHaveSignalValue(20).toMatchSnapshot();
      expect(outer.withParams(2, 3)).toHaveSignalValue(22).toMatchSnapshot();
      expect(outer.withParams(3, 3)).toHaveSignalValue(23).toMatchSnapshot();
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

      outer.withParams(1).watch();
      outer.withParams(3).watch();

      await nextTick();

      expect(outer.withParams(1)).toHaveSignalValue(2).toMatchSnapshot();
      expect(outer.withParams(3)).toHaveSignalValue(10).toMatchSnapshot();

      stateA.set(2);
      await nextTick();

      expect(outer.withParams(1)).toHaveSignalValue(3).toMatchSnapshot();
      expect(outer.withParams(3)).toHaveSignalValue(11).toMatchSnapshot();

      stateB.set(3);

      await nextTick();
      expect(outer.withParams(1)).toHaveSignalValue(3).toMatchSnapshot();
      expect(outer.withParams(3)).toHaveSignalValue(14).toMatchSnapshot();
    });
  });
});
