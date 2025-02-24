import { describe, expect, test } from 'vitest';
import { createStateSignal, createComputedSignal } from '../utils/instrumented-signals.js';

describe('Basic Signal functionality', () => {
  test('Can run basic computed', () => {
    const a = createStateSignal(1);
    const b = createStateSignal(2);

    const c = createComputedSignal(() => {
      return a.get() + b.get();
    });

    expect(c).toHaveSignalValueAndCounts(3, { compute: 1, get: 1 });

    // stability
    expect(c).toHaveSignalValueAndCounts(3, { compute: 1, get: 2 });
  });

  test('Computeds can be updated', () => {
    const a = createStateSignal(1);
    const b = createStateSignal(2);

    const c = createComputedSignal(() => {
      return a.get() + b.get();
    });

    expect(c).toHaveSignalValueAndCounts(3, { compute: 1, get: 1 });

    a.set(2);

    expect(c).toHaveSignalValueAndCounts(4, { compute: 2, get: 2 });
  });

  test('Does not update if value is the same', () => {
    const a = createStateSignal(1);
    const b = createStateSignal(2);

    const c = createComputedSignal(() => {
      return a.get() + b.get();
    });

    expect(c).toHaveSignalValueAndCounts(3, { compute: 1, get: 1 });

    a.set(1);

    expect(c).toHaveSignalValueAndCounts(3, { compute: 1, get: 2 });
  });

  describe('Nesting', () => {
    test('Can nest computeds', () => {
      const a = createStateSignal(1);
      const b = createStateSignal(2);
      const c = createStateSignal(2);

      const inner = createComputedSignal(() => {
        return a.get() + b.get();
      });

      const outer = createComputedSignal(() => {
        return inner.get() + c.get();
      });

      expect(inner).toHaveSignalValueAndCounts(3, { compute: 1, get: 1 });
      expect(outer).toHaveSignalValueAndCounts(5, { compute: 1, get: 1 });

      // stability
      expect(inner).toHaveSignalValueAndCounts(3, { compute: 1, get: 3 });
      expect(outer).toHaveSignalValueAndCounts(5, { compute: 1, get: 2 });
    });

    test('Can dirty inner computed and update parent', () => {
      const a = createStateSignal(1);
      const b = createStateSignal(2);
      const c = createStateSignal(2);

      const inner = createComputedSignal(() => {
        return a.get() + b.get();
      });

      const outer = createComputedSignal(() => {
        return inner.get() + c.get();
      });

      expect(inner).toHaveSignalValueAndCounts(3, { compute: 1, get: 1 });
      expect(outer).toHaveSignalValueAndCounts(5, { compute: 1, get: 1 });

      a.set(2);

      expect(inner).toHaveSignalValueAndCounts(4, { compute: 2, get: 3 });
      expect(outer).toHaveSignalValueAndCounts(6, { compute: 2, get: 2 });
    });

    test('Can dirty outer computed and inner stays cached', () => {
      const a = createStateSignal(1);
      const b = createStateSignal(2);
      const c = createStateSignal(2);

      const inner = createComputedSignal(() => {
        return a.get() + b.get();
      });

      const outer = createComputedSignal(() => {
        return inner.get() + c.get();
      });

      expect(inner).toHaveSignalValueAndCounts(3, { compute: 1, get: 1 });
      expect(outer).toHaveSignalValueAndCounts(5, { compute: 1, get: 1 });

      c.set(3);

      expect(inner).toHaveSignalValueAndCounts(3, { compute: 1, get: 3 });
      expect(outer).toHaveSignalValueAndCounts(6, { compute: 2, get: 2 });
    });

    test('Can nest multiple levels', () => {
      const a = createStateSignal(1);
      const b = createStateSignal(2);
      const c = createStateSignal(2);
      const d = createStateSignal(2);

      const inner = createComputedSignal(() => {
        return a.get() + b.get();
      });

      const mid = createComputedSignal(() => {
        return inner.get() + c.get();
      });

      const outer = createComputedSignal(() => {
        return mid.get() + d.get();
      });

      expect(inner).toHaveSignalValueAndCounts(3, { compute: 1 });
      expect(mid).toHaveSignalValueAndCounts(5, { compute: 1 });
      expect(outer).toHaveSignalValueAndCounts(7, { compute: 1 });

      a.set(2);

      expect(inner).toHaveSignalValueAndCounts(4, { compute: 2 });
      expect(mid).toHaveSignalValueAndCounts(6, { compute: 2 });
      expect(outer).toHaveSignalValueAndCounts(8, { compute: 2 });

      c.set(3);

      expect(inner).toHaveSignalValueAndCounts(4, { compute: 2 });
      expect(mid).toHaveSignalValueAndCounts(7, { compute: 3 });
      expect(outer).toHaveSignalValueAndCounts(9, { compute: 3 });

      d.set(3);

      expect(inner).toHaveSignalValueAndCounts(4, { compute: 2 });
      expect(mid).toHaveSignalValueAndCounts(7, { compute: 3 });
      expect(outer).toHaveSignalValueAndCounts(10, { compute: 4 });
    });
  });

  describe('Propagation', () => {
    test('it works with multiple parents', () => {
      const a = createStateSignal(1);
      const b = createStateSignal(2);
      const c = createStateSignal(2);
      const d = createStateSignal(2);

      const inner = createComputedSignal(() => {
        return a.get() + b.get();
      });

      const outer1 = createComputedSignal(() => {
        return inner.get() + c.get();
      });

      const outer2 = createComputedSignal(() => {
        return inner.get() + d.get();
      });

      expect(inner).toHaveSignalValueAndCounts(3, { compute: 1 });
      expect(outer1).toHaveSignalValueAndCounts(5, { compute: 1 });
      expect(outer2).toHaveSignalValueAndCounts(5, { compute: 1 });

      a.set(2);

      expect(inner).toHaveSignalValueAndCounts(4, { compute: 2 });
      expect(outer1).toHaveSignalValueAndCounts(6, { compute: 2 });
      expect(outer2).toHaveSignalValueAndCounts(6, { compute: 2 });

      b.set(3);

      expect(inner).toHaveSignalValueAndCounts(5, { compute: 3 });
      expect(outer2).toHaveSignalValueAndCounts(7, { compute: 3 });
      expect(outer1).toHaveSignalValueAndCounts(7, { compute: 3 });

      c.set(3);

      expect(inner).toHaveSignalValueAndCounts(5, { compute: 3 });
      expect(outer1).toHaveSignalValueAndCounts(8, { compute: 4 });
      expect(outer2).toHaveSignalValueAndCounts(7, { compute: 3 });

      d.set(3);

      expect(inner).toHaveSignalValueAndCounts(5, { compute: 3 });
      expect(outer1).toHaveSignalValueAndCounts(8, { compute: 4 });
      expect(outer2).toHaveSignalValueAndCounts(8, { compute: 4 });
    });

    test('it stops propagation if the result is the same', () => {
      const a = createStateSignal(1);
      const b = createStateSignal(2);
      const c = createStateSignal(2);
      const d = createStateSignal(2);

      const inner = createComputedSignal(
        () => {
          return a.get() + b.get();
        },
        { desc: 'inner' },
      );

      const outer1 = createComputedSignal(
        () => {
          return inner.get() + c.get();
        },
        { desc: 'outer1' },
      );

      const outer2 = createComputedSignal(
        () => {
          return inner.get() + d.get();
        },
        { desc: 'outer2' },
      );

      expect(() => {
        expect(outer1).toHaveSignalValueAndCounts(5, { compute: 1 });
        expect(outer2).toHaveSignalValueAndCounts(5, { compute: 1 });
        expect(inner).toHaveSignalValueAndCounts(3, { compute: 1 });
      }).toHaveComputedOrder(['outer1', 'inner', 'outer2']);

      a.set(2);
      b.set(1);

      expect(() => {
        expect(outer1).toHaveSignalValueAndCounts(5, { compute: 1 });
        expect(outer2).toHaveSignalValueAndCounts(5, { compute: 1 });
        expect(inner).toHaveSignalValueAndCounts(3, { compute: 2 });
      }).toHaveComputedOrder(['inner']);

      b.set(2);

      expect(() => {
        expect(outer2).toHaveSignalValueAndCounts(6, { compute: 2 });
        expect(outer1).toHaveSignalValueAndCounts(6, { compute: 2 });
        expect(inner).toHaveSignalValueAndCounts(4, { compute: 3 });
      }).toHaveComputedOrder(['inner', 'outer2', 'outer1']);
    });

    test('it continues propagation if any child is different', () => {
      const a = createStateSignal(1);
      const b = createStateSignal(2);
      const c = createStateSignal(2);
      const d = createStateSignal(2);

      const inner1 = createComputedSignal(
        () => {
          return a.get() + b.get();
        },
        { desc: 'inner1' },
      );

      const inner2 = createComputedSignal(
        () => {
          return c.get();
        },
        { desc: 'inner2' },
      );

      const inner3 = createComputedSignal(
        () => {
          return d.get();
        },
        { desc: 'inner3' },
      );

      const outer = createComputedSignal(
        () => {
          return inner1.get() + inner2.get() + inner3.get();
        },
        { desc: 'outer' },
      );

      expect(() => {
        expect(outer).toHaveSignalValueAndCounts(7, { compute: 1 });
      }).toHaveComputedOrder(['outer', 'inner1', 'inner2', 'inner3']);

      d.set(4);
      a.set(2);
      c.set(3);
      b.set(1);

      expect(() => {
        expect(outer).toHaveSignalValueAndCounts(10, { compute: 2 });
        expect(inner1).toHaveSignalCounts({ compute: 2 });
        expect(inner2).toHaveSignalCounts({ compute: 2 });
      }).toHaveComputedOrder(['inner1', 'inner2', 'outer', 'inner3']);
    });
  });

  describe('Laziness', () => {
    test('it does not compute values that are not used', () => {
      const a = createStateSignal(1);
      const b = createStateSignal(2);
      const c = createStateSignal(2);
      const d = createStateSignal(2);

      const inner1 = createComputedSignal(() => {
        return a.get() + b.get();
      });

      const inner2 = createComputedSignal(() => {
        return c.get() + d.get();
      });

      const outer = createComputedSignal(() => {
        if (inner1.get() <= 3) {
          return inner2.get();
        } else {
          return -1;
        }
      });

      expect(outer).toHaveSignalValueAndCounts(4, { compute: 1 });

      a.set(2);
      c.set(3);

      expect(outer).toHaveSignalValueAndCounts(-1, { compute: 2 });
      expect(inner1).toHaveSignalCounts({ compute: 2 });
      expect(inner2).toHaveSignalCounts({ compute: 1 });
    });
  });

  describe('Equality', () => {
    test('Does not update if value is the same (custom equality fn)', () => {
      const a = createStateSignal(1);
      const b = createStateSignal(2);

      const c = createComputedSignal(
        () => {
          return a.get() + b.get();
        },
        {
          equals(prev, next) {
            return Math.abs(prev - next) < 2;
          },
        },
      );

      expect(c).toHaveSignalValueAndCounts(3, { compute: 1 });

      a.set(2);

      expect(c).toHaveSignalValueAndCounts(3, { compute: 2 });
    });

    test('It stops propagation if the result is the same (custom equality fn)', () => {
      const a = createStateSignal(1);
      const b = createStateSignal(2);
      const c = createStateSignal(2);
      const d = createStateSignal(2);

      const inner = createComputedSignal(
        () => {
          return a.get() + b.get();
        },
        {
          equals(prev, next) {
            return Math.abs(prev - next) < 2;
          },
        },
      );

      const outer1 = createComputedSignal(() => {
        return inner.get() + c.get();
      });

      const outer2 = createComputedSignal(() => {
        return inner.get() + d.get();
      });

      expect(inner).toHaveSignalValueAndCounts(3, { compute: 1 });

      a.set(2);
      b.set(2);

      expect(inner).toHaveSignalValueAndCounts(3, { compute: 2 });
      expect(outer1).toHaveSignalValueAndCounts(5, { compute: 1 });
      expect(outer2).toHaveSignalValueAndCounts(5, { compute: 1 });
    });
  });
});
