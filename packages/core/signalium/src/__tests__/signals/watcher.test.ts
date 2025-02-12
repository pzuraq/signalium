import { describe, expect, test } from 'vitest';
import {
  state,
  createComputed,
  createAsyncComputed,
  createSubscription,
  createWatcher,
} from '../utils/instrumented-signals.js';
import { result } from '../utils/builders.js';
import { nextTick } from '../utils/async.js';

describe('Watcher functionality', () => {
  describe('with computeds', () => {
    test('watches computed values', async () => {
      const a = state(1);
      const b = state(2);

      const c = createComputed(() => {
        return a.get() + b.get();
      });

      let value;
      const w = createWatcher(() => {
        value = c.get();
      });

      w.addListener(() => {
        // do something
      });

      expect(value).toBe(undefined);
      expect(w).toHaveSignalCounts({ compute: 0, effect: 0 });

      await nextTick();

      expect(value).toBe(3);
      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });

      a.set(2);

      await nextTick();

      expect(value).toBe(4);
      expect(w).toHaveSignalCounts({ compute: 2, effect: 2 });
    });

    test('immediate option works', async () => {
      const a = state(1);
      const b = state(2);

      const c = createComputed(() => {
        return a.get() + b.get();
      });

      let value;
      const w = createWatcher(() => {
        value = c.get();
      });

      w.addListener(
        () => {
          // do something
        },
        { immediate: true },
      );

      expect(value).toBe(3);
      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });

      a.set(2);

      await nextTick();

      expect(value).toBe(4);
      expect(w).toHaveSignalCounts({ compute: 2, effect: 2 });
    });
  });

  describe('with async computeds', () => {
    test('watches async computed values', async () => {
      const a = state(1);
      const b = state(2);

      const c = createAsyncComputed(async () => {
        return a.get() + b.get();
      });

      let value;
      const w = createWatcher(() => {
        return c.get();
      });

      const unsub = w.addListener(v => {
        value = { ...v };
        // do something
      });

      expect(value).toEqual(undefined);
      expect(w).toHaveSignalCounts({ compute: 0, effect: 0 });

      await nextTick(); // First tick to start async computation

      expect(value).toEqual(result(undefined, 'pending', 'initial'));
      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });

      await nextTick(); // Extra tick for async resolution

      expect(value).toEqual(result(3, 'success', 'resolved'));
      expect(w).toHaveSignalCounts({ compute: 2, effect: 2 });

      a.set(2);

      await nextTick(); // First tick to start async computation

      expect(value).toEqual(result(3, 'pending', 'resolved'));
      expect(w).toHaveSignalCounts({ compute: 3, effect: 3 });

      await nextTick(); // Extra tick for async resolution

      expect(value).toEqual(result(4, 'success', 'resolved'));
      expect(w).toHaveSignalCounts({ compute: 4, effect: 4 });

      unsub();
    });

    test('immediate option works', async () => {
      const a = state(1);
      const b = state(2);

      const c = createAsyncComputed(async () => {
        return a.get() + b.get();
      });

      const w = createWatcher(() => {
        return c.get();
      });

      let value;
      w.addListener(
        v => {
          value = { ...v };
          // do something
        },
        {
          immediate: true,
        },
      );

      expect(value).toEqual(result(undefined, 'pending', 'initial'));
      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });

      await nextTick();
      await nextTick(); // Extra tick for async resolution

      expect(value).toEqual(result(3, 'success', 'resolved'));
      expect(w).toHaveSignalCounts({ compute: 2, effect: 2 });

      a.set(2);

      await nextTick(); // First tick to start async computation

      expect(value).toEqual(result(3, 'pending', 'resolved'));
      expect(w).toHaveSignalCounts({ compute: 3, effect: 3 });

      await nextTick(); // Extra tick for async resolution

      expect(value).toEqual(result(4, 'success', 'resolved'));
      expect(w).toHaveSignalCounts({ compute: 4, effect: 4 });
    });
  });

  describe('with subscriptions', () => {
    test('watches subscription values', async () => {
      let value = state(1);

      const s = createSubscription((get, set) => {
        set(value.get());

        return {
          update() {
            set(value.get());
          },
        };
      });

      let watchedValue;
      const w = createWatcher(() => {
        watchedValue = s.get();
      });

      w.addListener(() => {
        // do something
      });

      expect(watchedValue).toBe(undefined);
      expect(w).toHaveSignalCounts({ compute: 0, effect: 0 });
      expect(s).toHaveSignalValueAndCounts(undefined, { subscribe: 0 });

      await nextTick();

      expect(watchedValue).toBe(1);
      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });
      expect(s).toHaveSignalValueAndCounts(1, { subscribe: 1 });

      value.set(2);
      s.get();

      await nextTick();

      expect(watchedValue).toBe(2);
      expect(w).toHaveSignalCounts({ compute: 2, effect: 2 });
      expect(s).toHaveSignalValueAndCounts(2, { subscribe: 1 });
    });

    test('immediate option works', async () => {
      let value = state(1);

      const s = createSubscription((get, set) => {
        set(value.get());

        return {
          update() {
            set(value.get());
          },
        };
      });

      let watchedValue;
      const w = createWatcher(() => {
        watchedValue = s.get();
      });

      w.addListener(
        () => {
          // do something
        },
        { immediate: true },
      );

      expect(watchedValue).toBe(1);
      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });
      expect(s).toHaveSignalValueAndCounts(1, { subscribe: 1 });

      value.set(2);
      s.get();

      await nextTick();

      expect(watchedValue).toBe(2);
      expect(w).toHaveSignalCounts({ compute: 2, effect: 2 });
      expect(s).toHaveSignalValueAndCounts(2, { subscribe: 1 });
    });
  });
});
