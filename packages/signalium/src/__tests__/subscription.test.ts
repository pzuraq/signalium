import { describe, expect, test } from 'vitest';
import { state } from '../index.js';
import { reactive, subscription } from './utils/instrumented-hooks.js';
import { nextTick } from './utils/async.js';

describe('subscriptions', () => {
  test('Subscription can set initial value', () => {
    const sub = subscription(({ set }) => {
      set(1);
    });

    expect(sub).toHaveValueAndCounts(undefined, { compute: 0, internalSet: 0 });

    const computed = reactive(() => {
      return sub.value;
    });

    expect(computed).toHaveValueAndCounts(1, { compute: 1 });
    expect(sub).toHaveValueAndCounts(1, { compute: 1, internalSet: 1 });
  });

  test('Subscription can update value', async () => {
    const value = state(1);
    const sub = subscription(({ set }) => {
      set(value.get());

      return {
        update: () => {
          set(value.get());
        },
      };
    });

    const computed = reactive(
      () => {
        return sub.value;
      },
      {
        desc: 'computed',
      },
    );

    expect(computed).toHaveValueAndCounts(1, { compute: 1 });
    expect(sub).toHaveValueAndCounts(1, { compute: 1, internalSet: 1 });

    value.set(2);

    await nextTick();

    expect(computed).toHaveValueAndCounts(2, { compute: 2 });
    expect(sub).toHaveValueAndCounts(2, { compute: 2, internalSet: 2 });
  });

  test('Subscription can set multiple times', () => {
    const sub = subscription(({ set }) => {
      set(1);
      set(2);
      set(3);
    });

    const computed = reactive(() => {
      return sub.value;
    });

    expect(computed).toHaveValueAndCounts(3, { compute: 1 });
    expect(sub).toHaveValueAndCounts(3, { compute: 1, internalSet: 3 });
  });

  test('Can create a subscription within a reactive function context', async () => {
    const value = state(1);

    const computed = reactive(() => {
      return subscription(({ set }) => {
        set(value.get());

        return {
          update: () => {
            set(value.get());
          },
        };
      });
    });

    const sub = computed();

    expect(computed).toHaveCounts({ compute: 1 });
    expect(sub).toHaveValueAndCounts(undefined, { compute: 0, internalSet: 0 });

    const computed2 = reactive(() => {
      return computed().value;
    });

    expect(computed2).toHaveValueAndCounts(1, { compute: 1 });
    expect(sub).toHaveValueAndCounts(1, { compute: 1, internalSet: 1 });

    value.set(2);

    await nextTick();

    expect(sub).toHaveValueAndCounts(2, { compute: 2, internalSet: 2 });
  });

  test('Can create multiple subscriptions based on arguments within a reactive function context, with full lifecycle', async () => {
    const externalValue = state(1);

    const computed = reactive(
      (initValue: number) => {
        return subscription(
          ({ set }) => {
            set(initValue + externalValue.get());

            return {
              update: () => {
                set(initValue + externalValue.get());
              },
              unsubscribe: () => {},
            };
          },
          {
            desc: 'subscription',
          },
        );
      },
      {
        desc: 'computed',
      },
    );

    const sub1 = computed(1);
    const sub2 = computed(2);

    expect(computed.withParams(1)).toHaveCounts({ compute: 1 });
    expect(computed.withParams(2)).toHaveCounts({ compute: 1 });
    expect(sub1).toHaveValueAndCounts(undefined, { compute: 0, subscribe: 0, internalSet: 0 });
    expect(sub2).toHaveValueAndCounts(undefined, { compute: 0, subscribe: 0, internalSet: 0 });

    const initValue = state(1);

    const consumer = reactive(() => {
      return computed(initValue.get()).value;
    });

    expect(consumer).toHaveValueAndCounts(2, { compute: 1 });
    expect(sub1).toHaveValueAndCounts(2, { compute: 1, subscribe: 1, internalSet: 1 });
    expect(sub2).toHaveValueAndCounts(undefined, { compute: 0, subscribe: 0, internalSet: 0 });

    externalValue.set(2);

    await nextTick();

    expect(consumer).toHaveValueAndCounts(3, { compute: 2 });
    expect(sub1).toHaveValueAndCounts(3, { compute: 2, subscribe: 1, internalSet: 2 });
    expect(sub2).toHaveValueAndCounts(undefined, { compute: 0, internalSet: 0 });

    initValue.set(2);

    expect(consumer).toHaveValueAndCounts(4, { compute: 3 });
    expect(sub1).toHaveValueAndCounts(3, { compute: 2, internalSet: 2, unsubscribe: 0 });
    expect(sub2).toHaveValueAndCounts(4, { compute: 1, subscribe: 1, internalSet: 1 });

    await nextTick();

    expect(sub1).toHaveValueAndCounts(3, { compute: 2, internalSet: 2, unsubscribe: 1 });
  });

  test('Can switch between external subscriptions reactively', async () => {
    const externalValue = state(1);

    const makeSub = (initValue: number) => {
      return subscription(({ set }) => {
        set(initValue + externalValue.get());

        return {
          update: () => {
            set(initValue + externalValue.get());
          },
          unsubscribe: () => {},
        };
      });
    };

    const sub1 = makeSub(1);
    const sub2 = makeSub(2);

    expect(sub1).toHaveValueAndCounts(undefined, { compute: 0, subscribe: 0, internalSet: 0 });
    expect(sub2).toHaveValueAndCounts(undefined, { compute: 0, subscribe: 0, internalSet: 0 });

    const initValue = state(1);

    const consumer = reactive(() => {
      return initValue.get() === 1 ? sub1.value : sub2.value;
    });

    expect(consumer).toHaveValueAndCounts(2, { compute: 1 });
    expect(sub1).toHaveValueAndCounts(2, { compute: 1, subscribe: 1, internalSet: 1 });
    expect(sub2).toHaveValueAndCounts(undefined, { compute: 0, subscribe: 0, internalSet: 0 });

    externalValue.set(2);

    await nextTick();

    expect(consumer).toHaveValueAndCounts(3, { compute: 2 });
    expect(sub1).toHaveValueAndCounts(3, { compute: 2, subscribe: 1, internalSet: 2 });
    expect(sub2).toHaveValueAndCounts(undefined, { compute: 0, internalSet: 0 });

    initValue.set(2);

    expect(consumer).toHaveValueAndCounts(4, { compute: 3 });
    expect(sub1).toHaveValueAndCounts(3, { compute: 2, internalSet: 2, unsubscribe: 0 });
    expect(sub2).toHaveValueAndCounts(4, { compute: 1, subscribe: 1, internalSet: 1 });

    await nextTick();

    expect(sub1).toHaveValueAndCounts(3, { compute: 2, internalSet: 2, unsubscribe: 1 });
  });

  test('Lifecycle works properly with multiple consumers', async () => {
    const externalValue = state(1);

    const sub = subscription(
      ({ set }) => {
        set(1 + externalValue.get());

        return {
          update: () => {
            set(1 + externalValue.get());
          },
          unsubscribe: () => {},
        };
      },
      {
        initValue: 0,
      },
    );

    const useSub1 = state(true);

    const consumer1 = reactive(() => {
      return useSub1.get() ? sub.value : 0;
    });

    const useSub2 = state(true);
    const consumer2 = reactive(() => {
      return useSub2.get() ? sub.value : 0;
    });

    expect(sub).toHaveValueAndCounts(0, { compute: 0, subscribe: 0, internalSet: 0 });

    const root = reactive(
      () => {
        return consumer1() + consumer2();
      },
      {
        desc: 'root',
      },
    );

    expect(root).toHaveValueAndCounts(4, { compute: 1 });
    expect(sub).toHaveValueAndCounts(2, { compute: 1, subscribe: 1, internalSet: 1 });

    externalValue.set(2);

    await nextTick();

    expect(root).toHaveValueAndCounts(6, { compute: 2 });
    expect(sub).toHaveValueAndCounts(3, { compute: 2, subscribe: 1, internalSet: 2 });

    useSub1.set(false);

    await nextTick();

    expect(root).toHaveValueAndCounts(3, { compute: 3 });
    expect(sub).toHaveValueAndCounts(3, { compute: 2, subscribe: 1, internalSet: 2, unsubscribe: 0 });

    useSub2.set(false);

    await nextTick();

    expect(root).toHaveValueAndCounts(0, { compute: 4 });
    expect(sub).toHaveValueAndCounts(3, { compute: 2, subscribe: 1, internalSet: 2, unsubscribe: 1 });

    externalValue.set(3);

    await nextTick();

    expect(root).toHaveValueAndCounts(0, { compute: 4 });
    expect(sub).toHaveValueAndCounts(3, { compute: 2, subscribe: 1, update: 1, internalSet: 2, unsubscribe: 1 });

    useSub2.set(true);

    expect(root).toHaveValueAndCounts(4, { compute: 5 });
    expect(sub).toHaveValueAndCounts(4, { compute: 3, subscribe: 2, update: 1, internalSet: 3, unsubscribe: 1 });
  });

  test('Lifecycle works with nested subscriptions', async () => {
    const externalValue = state(1);

    const sub1 = subscription(
      ({ set }) => {
        set(1 + externalValue.get());

        return {
          update: () => {
            set(1 + externalValue.get());
          },
          unsubscribe: () => {},
        };
      },
      {
        initValue: 0,
        desc: 'sub1',
      },
    );

    const sub2 = subscription(
      ({ set }) => {
        set(sub1.value + 1);

        return {
          update: () => {
            set(sub1.value + 1);
          },
          unsubscribe: () => {},
        };
      },
      {
        initValue: 0,
        desc: 'sub2',
      },
    );

    const useSub1 = state(true);
    const consumer1 = reactive(
      () => {
        return useSub1.get() ? sub1.value : 0;
      },
      {
        desc: 'consumer1',
      },
    );

    const useSub2 = state(true);
    const consumer2 = reactive(
      () => {
        return useSub2.get() ? sub2.value : 0;
      },
      {
        desc: 'consumer2',
      },
    );

    expect(sub1).toHaveValueAndCounts(0, { compute: 0, subscribe: 0, internalSet: 0 });
    expect(sub2).toHaveValueAndCounts(0, { compute: 0, subscribe: 0, internalSet: 0 });

    const root = reactive(
      () => {
        return consumer1() + consumer2();
      },
      {
        desc: 'root',
      },
    );

    expect(root).toHaveValueAndCounts(5, { compute: 1 });
    expect(sub1).toHaveValueAndCounts(2, { compute: 1, subscribe: 1, internalSet: 1 });
    expect(sub2).toHaveValueAndCounts(3, { compute: 1, subscribe: 1, internalSet: 1 });

    externalValue.set(2);

    expect(root).toHaveValueAndCounts(5, { compute: 1 });
    expect(sub1).toHaveValueAndCounts(2, { compute: 1, subscribe: 1, internalSet: 1 });
    expect(sub2).toHaveValueAndCounts(3, { compute: 1, subscribe: 1, internalSet: 1 });

    await nextTick();

    expect(root).toHaveValueAndCounts(7, { compute: 3 });
    expect(sub1).toHaveValueAndCounts(3, { compute: 2, subscribe: 1, internalSet: 2 });
    expect(sub2).toHaveValueAndCounts(4, { compute: 2, subscribe: 1, internalSet: 2 });

    useSub1.set(false);

    await nextTick();

    expect(root).toHaveValueAndCounts(4, { compute: 4 });
    expect(sub1).toHaveValueAndCounts(3, { compute: 2, subscribe: 1, internalSet: 2, unsubscribe: 0 });
    expect(sub2).toHaveValueAndCounts(4, { compute: 2, subscribe: 1, internalSet: 2, unsubscribe: 0 });

    useSub2.set(false);

    await nextTick();

    expect(root).toHaveValueAndCounts(0, { compute: 5 });
    expect(sub1).toHaveValueAndCounts(3, { compute: 2, subscribe: 1, internalSet: 2, unsubscribe: 1 });
    expect(sub2).toHaveValueAndCounts(4, { compute: 2, subscribe: 1, internalSet: 2, unsubscribe: 1 });

    externalValue.set(3);

    await nextTick();

    expect(root).toHaveValueAndCounts(0, { compute: 5 });
    expect(sub1).toHaveValueAndCounts(3, { compute: 2, subscribe: 1, update: 1, internalSet: 2, unsubscribe: 1 });
    expect(sub2).toHaveValueAndCounts(4, { compute: 2, subscribe: 1, update: 1, internalSet: 2, unsubscribe: 1 });

    useSub2.set(true);

    expect(root).toHaveValueAndCounts(5, { compute: 6 });
    expect(sub1).toHaveValueAndCounts(4, { compute: 3, subscribe: 2, update: 1, internalSet: 3, unsubscribe: 1 });
    expect(sub2).toHaveValueAndCounts(5, { compute: 3, subscribe: 2, update: 1, internalSet: 3, unsubscribe: 1 });

    useSub2.set(false);

    await nextTick();

    expect(root).toHaveValueAndCounts(0, { compute: 7 });
    expect(sub1).toHaveValueAndCounts(4, { compute: 3, subscribe: 2, update: 1, internalSet: 3, unsubscribe: 2 });
    expect(sub2).toHaveValueAndCounts(5, { compute: 3, subscribe: 2, update: 1, internalSet: 3, unsubscribe: 2 });

    useSub1.set(true);

    expect(root).toHaveValueAndCounts(4, { compute: 8 });
    expect(sub1).toHaveValueAndCounts(4, { compute: 4, subscribe: 3, update: 1, internalSet: 4, unsubscribe: 2 });
    expect(sub2).toHaveValueAndCounts(5, { compute: 3, subscribe: 2, update: 1, internalSet: 3, unsubscribe: 2 });
  });

  test('Subscriptions can be awaited', async () => {
    const externalValue = state(1);

    const sub = subscription(({ set }) => {
      const value = externalValue.get();

      setTimeout(() => {
        set(value);
      });

      return {
        update: () => {
          const value = externalValue.get();

          set(value);
        },
      };
    });

    const inner1 = reactive(
      async (x: number) => {
        const state1 = externalValue.get();
        await nextTick();
        return x * state1;
      },
      {
        desc: 'inner1',
      },
    );

    const inner2 = reactive(
      async (x: number) => {
        const state2 = (await sub) as any;
        await nextTick();
        return x * state2;
      },
      {
        desc: 'inner2',
      },
    );

    const outer = reactive(
      async (x: number) => {
        const result1 = (await inner1(x)) as any;
        const result2 = (await inner2(x)) as any;
        return result1 + result2;
      },
      {
        desc: 'outer',
      },
    );

    const result1 = outer(2);
    expect(outer.withParams(2)).toHaveSignalValue(undefined);
    expect(result1.value).toBe(undefined);
    expect(result1.isPending).toBe(true);
    expect(sub).toHaveCounts({ compute: 0, subscribe: 0, internalSet: 0 });
    expect(inner1.withParams(2)).toHaveCounts({ compute: 1 });
    expect(inner2.withParams(2)).toHaveCounts({ compute: 0 });
    expect(outer.withParams(2)).toHaveCounts({ compute: 1 });

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(result1.value).toBe(4);
    expect(result1.isPending).toBe(false);
    expect(result1.isResolved).toBe(true);
    expect(inner1.withParams(2)).toHaveCounts({ compute: 1 });
    expect(inner2.withParams(2)).toHaveCounts({ compute: 1 });
    expect(outer.withParams(2)).toHaveCounts({ compute: 1 });

    externalValue.set(2);
    const result2 = outer(2);
    expect(result2.isPending).toBe(true);
    expect(result2.value).toBe(4);
    expect(inner1.withParams(2)).toHaveCounts({ compute: 2 });
    expect(inner2.withParams(2)).toHaveCounts({ compute: 1 });
    expect(outer.withParams(2)).toHaveCounts({ compute: 1 });

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(result2.value).toBe(8);
    expect(result2.isPending).toBe(false);
    expect(result2.isResolved).toBe(true);
    expect(inner1.withParams(2)).toHaveCounts({ compute: 2 });
    expect(inner2.withParams(2)).toHaveCounts({ compute: 2 });
    expect(outer.withParams(2)).toHaveCounts({ compute: 2 });
  });
});
