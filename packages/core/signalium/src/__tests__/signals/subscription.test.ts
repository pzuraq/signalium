import { describe, expect, test } from 'vitest';
import { state, createComputed, createSubscription, createWatcher } from '../utils/instrumented-signals.js';
import { nextTick } from '../utils/async.js';

describe('Subscription Signal functionality', () => {
  describe('subscribe', () => {
    test('Subscribes when first accessed when watched', async () => {
      const s = createSubscription(() => {}, { initValue: 123 });

      const w = createWatcher(() => {
        s.get();
      });

      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      expect(w).toHaveSignalCounts({ compute: 0, effect: 0 });

      await nextTick();

      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      expect(w).toHaveSignalCounts({ compute: 0, effect: 0 });

      w.addListener(() => {
        // do something;
      });

      await nextTick();

      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });

      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Subscribes if nested', async () => {
      const s = createSubscription(() => {}, { initValue: 123 });

      const c = createComputed(() => {
        s.get();
      });

      const w = createWatcher(() => {
        c.get();
      });

      expect(c).toHaveSignalCounts({ get: 0, compute: 0 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(c).toHaveSignalCounts({ get: 0, compute: 0 });
      expect(w).toHaveSignalCounts({ compute: 0, effect: 0 });

      w.addListener(() => {
        // do something;
      });

      await nextTick();

      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });
      expect(c).toHaveSignalCounts({ get: 1, compute: 1 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Subscribes when dynamically connected to a watcher', async () => {
      const a = state(false);

      const s = createSubscription(() => {}, { initValue: 123 });

      const w = createWatcher(() => {
        return a.get() ? s.get() : 0;
      });

      expect(w).toHaveSignalCounts({ compute: 0, effect: 0 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(w).toHaveSignalCounts({ compute: 0, effect: 0 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      w.addListener(() => {
        // do something;
      });

      await nextTick();

      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      a.set(true);

      await nextTick();

      expect(w).toHaveSignalCounts({ compute: 2, effect: 2 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Subscribes when dynamically used by a connected computed', async () => {
      const a = state(false);

      const s = createSubscription(() => {}, { initValue: 123 });

      const c = createComputed(() => {
        return a.get() ? s.get() : 0;
      });

      const w = createWatcher(() => {
        return c.get();
      });

      w.addListener(() => {
        // do something;
      });

      expect(w).toHaveSignalCounts({ compute: 0, effect: 0 });
      expect(c).toHaveSignalCounts({ get: 0, compute: 0 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });
      expect(c).toHaveSignalCounts({ get: 1, compute: 1 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      a.set(true);

      await nextTick();

      expect(w).toHaveSignalCounts({ compute: 2, effect: 2 });
      expect(c).toHaveSignalCounts({ get: 2, compute: 2 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Subscribes when parent is connected and uncached', async () => {
      const a = state(false);

      const s = createSubscription(() => {}, { initValue: 123 });

      const c = createComputed(() => {
        return s.get();
      });

      const w = createWatcher(() => {
        return a.get() ? c.get() : 0;
      });

      w.addListener(() => {
        // do something;
      });

      expect(w).toHaveSignalCounts({ compute: 0, effect: 0 });
      expect(c).toHaveSignalCounts({ get: 0, compute: 0 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });
      expect(c).toHaveSignalCounts({ get: 0, compute: 0 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      a.set(true);

      await nextTick();

      expect(w).toHaveSignalCounts({ compute: 2, effect: 2 });
      expect(c).toHaveSignalCounts({ get: 1, compute: 1 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Subscribes when parent is connected and dirty', async () => {
      const a = state(false);

      const s = createSubscription(() => {}, { initValue: 123 });

      const c = createComputed(() => {
        return a.get() ? s.get() : 0;
      });

      const w = createWatcher(() => {
        return a.get() ? c.get() : 0;
      });

      w.addListener(() => {
        // do something;
      });

      expect(w).toHaveSignalCounts({ compute: 0, effect: 0 });
      expect(c).toHaveSignalCounts({ get: 0, compute: 0 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });
      expect(c).toHaveSignalCounts({ get: 0, compute: 0 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      a.set(true);

      await nextTick();

      expect(w).toHaveSignalCounts({ compute: 2, effect: 2 });
      expect(c).toHaveSignalCounts({ get: 1, compute: 1 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Subscribes when parent is connected and cached', async () => {
      const a = state(false);

      const s = createSubscription(() => {}, { initValue: 123 });

      const c = createComputed(() => {
        return s.get();
      });

      const w = createWatcher(() => {
        return a.get() ? c.get() : 0;
      });

      w.addListener(() => {
        // do something;
      });

      expect(w).toHaveSignalCounts({ compute: 0, effect: 0 });
      expect(c).toHaveSignalCounts({ get: 0, compute: 0 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      c.get();

      expect(w).toHaveSignalCounts({ compute: 1, effect: 1 });
      expect(c).toHaveSignalCounts({ get: 1, compute: 1 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      a.set(true);

      await nextTick();

      expect(w).toHaveSignalCounts({ compute: 2, effect: 2 });
      expect(c).toHaveSignalValueAndCounts(123, { get: 3, compute: 1 });
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Can set value during initial subscribe and value is used', async () => {
      const s = createSubscription(
        (get, set) => {
          set(456);
        },
        { initValue: 123 },
      );

      const w = createWatcher(() => {
        return s.get();
      });

      w.addListener(() => {
        // do something;
      });

      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(s).toHaveSignalValueAndCounts(456, {
        subscribe: 1,
      });
    });

    test('Can set value during resubscribe and value is used', async () => {
      const s = createSubscription(
        (get, set) => {
          set(get()! + 1);
        },
        { initValue: 123 },
      );

      let value;

      const w = createWatcher(() => {
        value = s.get();
      });

      const unsub = w.addListener(() => {
        // do something;
      });

      await nextTick();

      expect(value).toBe(124);
      expect(s).toHaveSignalValueAndCounts(124, {
        subscribe: 1,
        unsubscribe: 0,
      });

      unsub();

      await nextTick();

      expect(value).toBe(124);
      expect(s).toHaveSignalValueAndCounts(124, {
        subscribe: 1,
        unsubscribe: 1,
      });

      w.addListener(() => {
        // do something;
      });

      await nextTick();

      expect(value).toBe(125);
      expect(s).toHaveSignalValueAndCounts(125, {
        subscribe: 2,
        unsubscribe: 1,
      });
    });

    test('Can set value during resubscribe and cached parents are dirtied', async () => {
      const s = createSubscription(
        (get, set) => {
          set((get() ?? 0) + 1);
        },
        { initValue: 123 },
      );

      const c = createComputed(() => {
        return s.get() + 1;
      });

      let value;

      const w = createWatcher(() => {
        value = c.get();
      });

      const unsub = w.addListener(() => {
        // do something;
      });

      await nextTick();

      expect(value).toBe(125);
      expect(s).toHaveSignalValueAndCounts(124, {
        subscribe: 1,
        unsubscribe: 0,
      });

      unsub();

      await nextTick();

      expect(value).toBe(125);
      expect(s).toHaveSignalValueAndCounts(124, {
        subscribe: 1,
        unsubscribe: 1,
      });

      w.addListener(() => {
        // do something;
      });

      await nextTick();

      expect(value).toBe(126);
      expect(s).toHaveSignalValueAndCounts(125, {
        subscribe: 2,
      });
    });

    test('Update can set value during eager pull and updated value is used by parent', async () => {
      // ...
    });

    test('Update can set value and trigger a dirty for parent that happens in the same flush', async () => {
      // ...
    });

    test('Update can trigger an dirty for a parent that has already flushed this time around (secondary flush, edge case)', async () => {
      // ...
    });
  });

  describe('unsubscribe', async () => {
    test('It unsubscribes when all watchers are disconnected', async () => {
      const s = createSubscription(
        (get, set) => {
          return {
            unsubscribe() {
              // ...
            },
          };
        },
        { initValue: 123 },
      );

      let value;

      let w = createWatcher(() => {
        value = s.get();
      });

      let w2 = createWatcher(() => {
        s.get();
      });

      const unsub1 = w.addListener(() => {
        // do something;
      });

      const unsub2 = w2.addListener(() => {
        // do something;
      });

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      unsub1();
      unsub2();

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 1,
      });
    });

    test('It unsubscribes when all watchers are disconnected at different times', async () => {
      const s = createSubscription(
        (get, set) => {
          return {
            unsubscribe() {
              // ...
            },
          };
        },
        { initValue: 123 },
      );

      let value;

      let w = createWatcher(() => {
        value = s.get();
      });

      const unsub1 = w.addListener(() => {
        // do something;
      });

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      let w2 = createWatcher(() => {
        s.get();
      });

      const unsub2 = w2.addListener(() => {
        // do something;
      });

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      unsub1();

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      unsub2();

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 1,
      });
    });

    test('It stays subscribed when all watchers are disconnected and new ones are connected in the same flush', async () => {
      const s = createSubscription(
        (get, set) => {
          return {
            unsubscribe() {
              // ...
            },
          };
        },
        { initValue: 123 },
      );

      let value;

      let w = createWatcher(() => {
        value = s.get();
      });

      let w2 = createWatcher(() => {
        s.get();
      });

      let unsub1 = w.addListener(() => {
        // do something;
      });

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      unsub1();

      let unsub2 = w2.addListener(() => {
        // do something;
      });

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      unsub1 = w.addListener(() => {
        // do something;
      });

      unsub2();

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      unsub1();

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveSignalValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 1,
      });
    });
  });
});
