import { describe, expect, test } from 'vitest';
import { state, computed, subscription, watcher } from './utils/instrumented.js';

const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));
const nextTick = () => sleep();

describe('Subscription Signal functionality', () => {
  describe('subscribe', () => {
    test('Subscribes when first accessed when watched', async () => {
      const s = subscription(() => {}, { initValue: 123 });

      const w = watcher(() => {
        s.get();
      });

      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Subscribes if nested', async () => {
      const s = subscription(() => {}, { initValue: 123 });

      const c = computed(() => {
        s.get();
      });

      const w = watcher(() => {
        c.get();
      });

      expect(c).toHaveCounts({ get: 0, compute: 0 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(c).toHaveCounts({ get: 1, compute: 1 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Subscribes when dynamically connected to a watcher', async () => {
      const a = state(false);

      const s = subscription(() => {}, { initValue: 123 });

      const w = watcher(() => {
        return a.get() ? s.get() : 0;
      });

      expect(w).toHaveCounts({ effect: 0 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(w).toHaveCounts({ effect: 1 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      a.set(true);

      await nextTick();

      expect(w).toHaveCounts({ effect: 2 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Subscribes when dynamically used by a connected computed', async () => {
      const a = state(false);

      const s = subscription(() => {}, { initValue: 123 });

      const c = computed(() => {
        return a.get() ? s.get() : 0;
      });

      const w = watcher(() => {
        return c.get();
      });

      expect(w).toHaveCounts({ effect: 0 });
      expect(c).toHaveCounts({ get: 0, compute: 0 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(w).toHaveCounts({ effect: 1 });
      expect(c).toHaveCounts({ get: 1, compute: 1 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      a.set(true);

      await nextTick();

      expect(w).toHaveCounts({ effect: 2 });
      expect(c).toHaveCounts({ get: 2, compute: 2 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Subscribes when parent is connected and uncached', async () => {
      const a = state(false);

      const s = subscription(() => {}, { initValue: 123 });

      const c = computed(() => {
        return s.get();
      });

      const w = watcher(() => {
        return a.get() ? c.get() : 0;
      });

      expect(w).toHaveCounts({ effect: 0 });
      expect(c).toHaveCounts({ get: 0, compute: 0 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(w).toHaveCounts({ effect: 1 });
      expect(c).toHaveCounts({ get: 0, compute: 0 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      a.set(true);

      await nextTick();

      expect(w).toHaveCounts({ effect: 2 });
      expect(c).toHaveCounts({ get: 1, compute: 1 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Subscribes when parent is connected and dirty', async () => {
      const a = state(false);

      const s = subscription(() => {}, { initValue: 123 });

      const c = computed(() => {
        return a.get() ? s.get() : 0;
      });

      const w = watcher(() => {
        return a.get() ? c.get() : 0;
      });

      expect(w).toHaveCounts({ effect: 0 });
      expect(c).toHaveCounts({ get: 0, compute: 0 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(w).toHaveCounts({ effect: 1 });
      expect(c).toHaveCounts({ get: 0, compute: 0 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      a.set(true);

      await nextTick();

      expect(w).toHaveCounts({ effect: 2 });
      expect(c).toHaveCounts({ get: 1, compute: 1 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Subscribes when parent is connected and cached', async () => {
      const a = state(false);

      const s = subscription(() => {}, { initValue: 123 });

      const c = computed(() => {
        return s.get();
      });

      const w = watcher(() => {
        return a.get() ? c.get() : 0;
      });

      expect(w).toHaveCounts({ effect: 0 });
      expect(c).toHaveCounts({ get: 0, compute: 0 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      c.get();

      expect(w).toHaveCounts({ effect: 1 });
      expect(c).toHaveCounts({ get: 1, compute: 1 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      a.set(true);

      await nextTick();

      expect(w).toHaveCounts({ effect: 2 });
      expect(c).toHaveCounts({ get: 2, compute: 1 });
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
      });
    });

    test('Can set value during initial subscribe and value is used', async () => {
      const s = subscription(
        (get, set) => {
          set(456);
        },
        { initValue: 123 },
      );

      watcher(() => {
        expect(s.get()).toBe(456);
      });

      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(s).toHaveValueAndCounts(456, {
        subscribe: 1,
      });
    });

    test('Can set value during resubscribe and value is used', async () => {
      const s = subscription(
        (get, set) => {
          set(get() + 1);
        },
        { initValue: 123 },
      );

      let value;

      let w = watcher(() => {
        value = s.get();
      });

      await nextTick();

      expect(value).toBe(124);
      expect(s).toHaveValueAndCounts(124, {
        subscribe: 1,
      });

      w.disconnect();

      await nextTick();

      expect(value).toBe(124);
      expect(s).toHaveValueAndCounts(124, {
        subscribe: 1,
      });

      w = watcher(() => {
        value = s.get();
      });

      await nextTick();

      expect(value).toBe(125);
      expect(s).toHaveValueAndCounts(125, {
        subscribe: 2,
      });
    });

    test('Can set value during resubscribe and cached parents are dirtied', async () => {
      const s = subscription(
        (get, set) => {
          set(get() + 1);
        },
        { initValue: 123 },
      );

      const c = computed(() => {
        return s.get() + 1;
      });

      let value;

      let w = watcher(() => {
        value = c.get();
      });

      await nextTick();

      expect(value).toBe(125);
      expect(s).toHaveValueAndCounts(124, {
        subscribe: 1,
      });

      w.disconnect();

      await nextTick();

      expect(value).toBe(125);
      expect(s).toHaveValueAndCounts(124, {
        subscribe: 1,
      });

      w = watcher(() => {
        value = c.get();
      });

      await nextTick();

      expect(value).toBe(126);
      expect(s).toHaveValueAndCounts(125, {
        subscribe: 2,
      });
    });
  });

  describe('update', () => {
    test('Updates if consumed values are changed', async () => {
      const a = state(0);

      const s = subscription(
        (get, set) => {
          set(a.get() + 1);

          return {
            update() {
              set(a.get() + 1);
            },
          };
        },
        { initValue: 123 },
      );

      watcher(() => {
        s.get();
      });

      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(s).toHaveValueAndCounts(1, {
        subscribe: 1,
      });

      a.set(1);

      expect(s).toHaveValueAndCounts(2, {
        subscribe: 1,
        update: 1,
      });
    });

    test('Update is scheduled and values are pulled if subscription is active and dirtied, even if parents are not', async () => {
      const a = state(0);

      const s = subscription(
        (get, set) => {
          set(a.get() + 1);

          return {
            update() {
              set(a.get() + 1);
            },
          };
        },
        { initValue: 123 },
      );

      const w = watcher(() => {
        s.get();
      });

      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(w).toHaveCounts({ effect: 1 });
      expect(s).toHaveValueAndCounts(1, {
        subscribe: 1,
      });

      a.set(1);

      await nextTick();

      expect(s).toHaveValueAndCounts(2, {
        subscribe: 1,
        update: 1,
      });

      expect(w).toHaveCounts({ effect: 1 });
    });

    test('Update is pulled eagerly if a parent is scheduled before a subscription and uses the updates value', async () => {
      const a = state(0);
      const b = state(0);

      const s = subscription(
        (get, set) => {
          set(a.get() + 1);

          return {
            update() {
              set(a.get() + 1);
            },
          };
        },
        { initValue: 123 },
      );

      let value;

      const w = watcher(() => {
        b.get();
        value = s.get();
      });

      expect(s).toHaveValueAndCounts(123, {
        subscribe: 0,
      });

      await nextTick();

      expect(w).toHaveCounts({ effect: 1 });
      expect(s).toHaveValueAndCounts(1, {
        subscribe: 1,
      });

      b.set(1);
      a.set(1);

      await nextTick();

      expect(value).toBe(2);

      expect(s).toHaveValueAndCounts(2, {
        subscribe: 1,
        update: 1,
      });

      expect(w).toHaveCounts({ effect: 2 });
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
      const s = subscription(
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

      let w = watcher(() => {
        value = s.get();
      });

      let w2 = watcher(() => {
        s.get();
      });

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      w.disconnect();
      w2.disconnect();

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 1,
      });
    });

    test('It unsubscribes when all watchers are disconnected at different times', async () => {
      const s = subscription(
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

      let w = watcher(() => {
        value = s.get();
      });

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      let w2 = watcher(() => {
        s.get();
      });

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      w.disconnect();

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      w2.disconnect();

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 1,
      });
    });

    test('It stays subscribed when all watchers are disconnected and new ones are connected in the same flush', async () => {
      const s = subscription(
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

      let w = watcher(() => {
        value = s.get();
      });

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      w.disconnect();
      let w2 = watcher(() => {
        console.log('test');
        s.get();
      });

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 0,
      });

      w2.disconnect();

      await nextTick();

      expect(value).toBe(123);
      expect(s).toHaveValueAndCounts(123, {
        subscribe: 1,
        unsubscribe: 1,
      });
    });
  });
});
