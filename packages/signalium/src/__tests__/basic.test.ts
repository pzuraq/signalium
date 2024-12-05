import { describe, expect, test } from 'vitest';
import { state, computed } from './utils/instrumented.js';

describe.skip('Basic Signal functionality', () => {
  test('Can run basic computed', () => {
    const a = state(1);
    const b = state(2);

    const c = computed(() => {
      return a.get() + b.get();
    });

    expect(c).toHaveValueAndCounts(3, { compute: 1, get: 1 });

    // stability
    expect(c).toHaveValueAndCounts(3, { compute: 1, get: 2 });
  });

  test('Computeds can be updated', () => {
    const a = state(1);
    const b = state(2);

    const c = computed(() => {
      return a.get() + b.get();
    });

    expect(c).toHaveValueAndCounts(3, { compute: 1, get: 1 });

    a.set(2);

    expect(c).toHaveValueAndCounts(4, { compute: 2, get: 2 });
  });

  test('Does not update if value is the same', () => {
    const a = state(1);
    const b = state(2);

    const c = computed(() => {
      return a.get() + b.get();
    });

    expect(c).toHaveValueAndCounts(3, { compute: 1, get: 1 });

    a.set(1);

    expect(c).toHaveValueAndCounts(3, { compute: 1, get: 2 });
  });

  describe('Nesting', () => {
    test('Can nest computeds', () => {
      const a = state(1);
      const b = state(2);
      const c = state(2);

      const inner = computed(() => {
        return a.get() + b.get();
      });

      const outer = computed(() => {
        return inner.get() + c.get();
      });

      expect(inner).toHaveValueAndCounts(3, { compute: 1, get: 1 });
      expect(outer).toHaveValueAndCounts(5, { compute: 1, get: 1 });

      // stability
      expect(inner).toHaveValueAndCounts(3, { compute: 1, get: 3 });
      expect(outer).toHaveValueAndCounts(5, { compute: 1, get: 2 });
    });

    test('Can dirty inner computed and update parent', () => {
      const a = state(1);
      const b = state(2);
      const c = state(2);

      const inner = computed(() => {
        return a.get() + b.get();
      });

      const outer = computed(() => {
        return inner.get() + c.get();
      });

      expect(inner).toHaveValueAndCounts(3, { compute: 1, get: 1 });
      expect(outer).toHaveValueAndCounts(5, { compute: 1, get: 1 });

      a.set(2);

      expect(inner).toHaveValueAndCounts(4, { compute: 2, get: 3 });
      expect(outer).toHaveValueAndCounts(6, { compute: 2, get: 2 });
    });

    test('Can dirty outer computed and inner stays cached', () => {
      const a = state(1);
      const b = state(2);
      const c = state(2);

      const inner = computed(() => {
        return a.get() + b.get();
      });

      const outer = computed(() => {
        return inner.get() + c.get();
      });

      expect(inner).toHaveValueAndCounts(3, { compute: 1, get: 1 });
      expect(outer).toHaveValueAndCounts(5, { compute: 1, get: 1 });

      c.set(3);

      expect(inner).toHaveValueAndCounts(3, { compute: 1, get: 3 });
      expect(outer).toHaveValueAndCounts(6, { compute: 2, get: 2 });
    });

    test('Can nest multiple levels', () => {
      const a = state(1);
      const b = state(2);
      const c = state(2);
      const d = state(2);

      const inner = computed(() => {
        return a.get() + b.get();
      });

      const mid = computed(() => {
        return inner.get() + c.get();
      });

      const outer = computed(() => {
        return mid.get() + d.get();
      });

      expect(inner).toHaveValueAndCounts(3, { compute: 1 });
      expect(mid).toHaveValueAndCounts(5, { compute: 1 });
      expect(outer).toHaveValueAndCounts(7, { compute: 1 });

      a.set(2);

      expect(inner).toHaveValueAndCounts(4, { compute: 2 });
      expect(mid).toHaveValueAndCounts(6, { compute: 2 });
      expect(outer).toHaveValueAndCounts(8, { compute: 2 });

      c.set(3);

      expect(inner).toHaveValueAndCounts(4, { compute: 2 });
      expect(mid).toHaveValueAndCounts(7, { compute: 3 });
      expect(outer).toHaveValueAndCounts(9, { compute: 3 });

      d.set(3);

      expect(inner).toHaveValueAndCounts(4, { compute: 2 });
      expect(mid).toHaveValueAndCounts(7, { compute: 3 });
      expect(outer).toHaveValueAndCounts(10, { compute: 4 });
    });
  });

  describe('Propagation', () => {
    test('it works with multiple parents', () => {
      const a = state(1);
      const b = state(2);
      const c = state(2);
      const d = state(2);

      const inner = computed(() => {
        return a.get() + b.get();
      });

      const outer1 = computed(() => {
        return inner.get() + c.get();
      });

      const outer2 = computed(() => {
        return inner.get() + d.get();
      });

      expect(inner).toHaveValueAndCounts(3, { compute: 1 });
      expect(outer1).toHaveValueAndCounts(5, { compute: 1 });
      expect(outer2).toHaveValueAndCounts(5, { compute: 1 });

      a.set(2);

      expect(inner).toHaveValueAndCounts(4, { compute: 2 });
      expect(outer1).toHaveValueAndCounts(6, { compute: 2 });
      expect(outer2).toHaveValueAndCounts(6, { compute: 2 });

      b.set(3);

      expect(inner).toHaveValueAndCounts(5, { compute: 3 });
      expect(outer2).toHaveValueAndCounts(7, { compute: 3 });
      expect(outer1).toHaveValueAndCounts(7, { compute: 3 });

      c.set(3);

      expect(inner).toHaveValueAndCounts(5, { compute: 3 });
      expect(outer1).toHaveValueAndCounts(8, { compute: 4 });
      expect(outer2).toHaveValueAndCounts(7, { compute: 3 });

      d.set(3);

      expect(inner).toHaveValueAndCounts(5, { compute: 3 });
      expect(outer1).toHaveValueAndCounts(8, { compute: 4 });
      expect(outer2).toHaveValueAndCounts(8, { compute: 4 });
    });

    test('it stops propagation if the result is the same', () => {
      const a = state(1);
      const b = state(2);
      const c = state(2);
      const d = state(2);

      const inner = computed('inner', () => {
        return a.get() + b.get();
      });

      const outer1 = computed('outer1', () => {
        return inner.get() + c.get();
      });

      const outer2 = computed('outer2', () => {
        return inner.get() + d.get();
      });

      expect(() => {
        expect(outer1).toHaveValueAndCounts(5, { compute: 1 });
        expect(outer2).toHaveValueAndCounts(5, { compute: 1 });
        expect(inner).toHaveValueAndCounts(3, { compute: 1 });
      }).toHaveComputedOrder(['outer1', 'inner', 'outer2']);

      a.set(2);
      b.set(1);

      expect(() => {
        expect(outer1).toHaveValueAndCounts(5, { compute: 1 });
        expect(outer2).toHaveValueAndCounts(5, { compute: 1 });
        expect(inner).toHaveValueAndCounts(3, { compute: 2 });
      }).toHaveComputedOrder(['inner']);

      b.set(2);

      expect(() => {
        expect(outer2).toHaveValueAndCounts(6, { compute: 2 });
        expect(outer1).toHaveValueAndCounts(6, { compute: 2 });
        expect(inner).toHaveValueAndCounts(4, { compute: 3 });
      }).toHaveComputedOrder(['inner', 'outer2', 'outer1']);
    });

    test('it continues propagation if any child is different', () => {
      const a = state(1);
      const b = state(2);
      const c = state(2);
      const d = state(2);

      const inner1 = computed('inner1', () => {
        return a.get() + b.get();
      });

      const inner2 = computed('inner2', () => {
        return c.get();
      });

      const inner3 = computed('inner3', () => {
        return d.get();
      });

      const outer = computed('outer', () => {
        return inner1.get() + inner2.get() + inner3.get();
      });

      expect(() => {
        expect(outer).toHaveValueAndCounts(7, { compute: 1 });
      }).toHaveComputedOrder(['outer', 'inner1', 'inner2', 'inner3']);

      d.set(4);
      a.set(2);
      c.set(3);
      b.set(1);

      expect(() => {
        expect(outer).toHaveValueAndCounts(10, { compute: 2 });
        expect(inner1).toHaveCounts({ compute: 2 });
        expect(inner2).toHaveCounts({ compute: 2 });
      }).toHaveComputedOrder(['inner1', 'inner2', 'outer', 'inner3']);
    });
  });

  describe('Laziness', () => {
    test('it does not compute values that are not used', () => {
      const a = state(1);
      const b = state(2);
      const c = state(2);
      const d = state(2);

      const inner1 = computed(() => {
        return a.get() + b.get();
      });

      const inner2 = computed(() => {
        return c.get() + d.get();
      });

      const outer = computed(() => {
        if (inner1.get() <= 3) {
          return inner2.get();
        } else {
          return -1;
        }
      });

      expect(outer).toHaveValueAndCounts(4, { compute: 1 });

      a.set(2);
      c.set(3);

      expect(outer).toHaveValueAndCounts(-1, { compute: 2 });
      expect(inner1).toHaveCounts({ compute: 2 });
      expect(inner2).toHaveCounts({ compute: 1 });
    });
  });

  describe('Equality', () => {
    test('Does not update if value is the same (custom equality fn)', () => {
      const a = state(1);
      const b = state(2);

      const c = computed(
        () => {
          return a.get() + b.get();
        },
        {
          equals(prev, next) {
            return Math.abs(prev - next) < 2;
          },
        },
      );

      expect(c).toHaveValueAndCounts(3, { compute: 1 });

      a.set(2);

      expect(c).toHaveValueAndCounts(3, { compute: 2 });
    });

    test('It stops propagation if the result is the same (custom equality fn)', () => {
      const a = state(1);
      const b = state(2);
      const c = state(2);
      const d = state(2);

      const inner = computed(
        () => {
          return a.get() + b.get();
        },
        {
          equals(prev, next) {
            return Math.abs(prev - next) < 2;
          },
        },
      );

      const outer1 = computed(() => {
        return inner.get() + c.get();
      });

      const outer2 = computed(() => {
        return inner.get() + d.get();
      });

      expect(inner).toHaveValueAndCounts(3, { compute: 1 });

      a.set(2);
      b.set(2);

      expect(inner).toHaveValueAndCounts(3, { compute: 2 });
      expect(outer1).toHaveValueAndCounts(5, { compute: 1 });
      expect(outer2).toHaveValueAndCounts(5, { compute: 1 });
    });
  });
});
