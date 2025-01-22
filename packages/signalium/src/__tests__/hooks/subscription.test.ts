import { describe, expect, test } from 'vitest';
import { state } from '../../index.js';
import { subscription } from '../utils/instrumented-hooks.js';
import { nextTick } from '../utils/async.js';

describe('subscriptions', () => {
  test('Subscription can set initial value', () => {
    const sub = subscription(({ set }) => {
      set(1);
    });

    expect(sub).toHaveValueAndCounts(1, { compute: 1, internalSet: 1 });
  });

  test('Subscription can update value', () => {
    const value = state(1);
    const sub = subscription(({ set }) => {
      set(value.get());

      return {
        update: () => {
          set(value.get());
        },
      };
    });

    expect(sub).toHaveValueAndCounts(1, { compute: 1, internalSet: 1 });

    value.set(2);
    expect(sub).toHaveValueAndCounts(2, { compute: 2, internalSet: 2 });
  });

  test('Subscription can set multiple times', () => {
    const sub = subscription(({ set }) => {
      set(1);
      set(2);
      set(3);
    });

    expect(sub).toHaveValueAndCounts(3, { compute: 1, internalSet: 3 });
  });

  test('Subscription can access parameters', () => {
    const sub = subscription(({ set }, value: number) => {
      set(value);
    });

    expect(sub).withParams(1).toHaveValueAndCounts(1, { compute: 1, internalSet: 1 });
    expect(sub).withParams(2).toHaveValueAndCounts(2, { compute: 2, internalSet: 2 });
  });

  test('Subscription is recomputed when parameters change', () => {
    const sub = subscription(({ set }, value: number) => {
      set(value);

      return {
        update: () => {
          set(value * 2);
        },
      };
    });

    expect(sub).withParams(1).toHaveValueAndCounts(1, { compute: 1, internalSet: 1 });
    expect(sub).withParams(2).toHaveValueAndCounts(2, { compute: 2, internalSet: 2 });
  });

  test('Subscription is not recomputed when same parameters are passed', () => {
    const sub = subscription(({ set }, value: number) => {
      set(value);
    });

    expect(sub).withParams(1).toHaveValueAndCounts(1, { compute: 1, internalSet: 1 });
    expect(sub).withParams(1).toHaveValueAndCounts(1, { compute: 1, internalSet: 1 });
  });

  test('Subscription updates automatically when state changes', async () => {
    const value = state(1);
    const sub = subscription(({ set }) => {
      set(value.get());

      return {
        update: () => {
          set(value.get());
        },
      };
    });

    expect(sub).toHaveValueAndCounts(1, { compute: 1, internalSet: 1 });

    value.set(2);

    await nextTick();

    expect(sub).toHaveCounts({ compute: 2, internalSet: 2 });
    expect(sub).toHaveHookValue(2);
  });
});
