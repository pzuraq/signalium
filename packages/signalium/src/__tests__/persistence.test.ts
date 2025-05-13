import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reactive, state } from '../hooks.js';
import { setConfig } from '../config.js';
import { PersistenceStore } from '../config.js';
import { getStorageKey, serialize, type PersistedValue } from '../internals/persistence.js';
import { hashArray } from '../internals/utils/hash.js';

function storageKey(key: string, args: unknown[]) {
  return getStorageKey(key, hashArray(args));
}

// Mock persistence store for testing
class MockStore implements PersistenceStore {
  private store = new Map<string, PersistedValue<unknown>>();

  get = vi.fn((key: string): PersistedValue<unknown> | undefined => {
    return this.store.get(key) as PersistedValue<unknown> | undefined;
  });

  set = vi.fn((key: string, value: PersistedValue<unknown>): void => {
    this.store.set(key, value);
  });

  remove = vi.fn((key: string): void => {
    this.store.delete(key);
  });

  clear = vi.fn((): void => {
    this.store.clear();
  });

  // Helper for tests to simulate store failure
  enableFailMode() {
    this.get.mockImplementation(() => {
      throw new Error('Storage error');
    });
    this.set.mockImplementation(() => {
      throw new Error('Storage error');
    });
  }

  disableFailMode() {
    this.get.mockImplementation((key: string) => this.store.get(key) || undefined);
    this.set.mockImplementation((key: string, value: PersistedValue<unknown>) => this.store.set(key, value));
  }

  // Helper to get all stored data for assertions
  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.store.forEach((value, key) => {
      try {
        result[key] = value;
      } catch (e) {
        result[key] = value;
      }
    });
    return result;
  }
}

describe('Persistence', () => {
  let store: MockStore;

  beforeEach(() => {
    store = new MockStore();
    setConfig({
      persistenceStore: store,
    });
  });

  afterEach(() => {
    store.clear();
    setConfig({
      persistenceStore: undefined,
    });
    vi.restoreAllMocks();
  });

  describe('Cold start (nothing persisted)', () => {
    it('executes compute function and persists the result', () => {
      const compute = vi.fn(() => 'Hello, World!');

      const getGreeting = reactive(compute, {
        persist: {
          key: 'greeting',
        },
      });

      // Access the value to trigger computation
      const greeting = getGreeting();

      // Verify compute was called
      expect(compute).toHaveBeenCalledTimes(1);
      expect(greeting).toBe('Hello, World!');

      // Verify value was persisted
      expect(store.set).toHaveBeenCalledTimes(1);
      expect(store.set).toHaveBeenCalledWith(storageKey('greeting', []), ['value', 'Hello, World!']);
    });
  });

  describe('Hydration path', () => {
    it('skips computation if value exists in store', () => {
      // Pre-populate the store
      store.set(storageKey('greeting', []), ['value', 'Hello from storage']);

      // Create compute function with spy
      const compute = vi.fn(() => 'This should not be called');

      const getGreeting = reactive(compute, {
        persist: {
          key: 'greeting',
        },
      });

      // Access the value
      const greeting = getGreeting();

      // Verify compute was NOT called
      expect(compute).not.toHaveBeenCalled();

      // Verify hydrated value was returned
      expect(greeting).toBe('Hello from storage');
    });
  });

  describe('Custom dehydrate/hydrate functions', () => {
    it('uses custom dehydrate function to transform data for storage', () => {
      const getUser = reactive(() => ({ name: 'John', age: 30 }), {
        persist: {
          key: 'user',
          dehydrate: value => ({ name: value.name.toUpperCase(), age: value.age }),
          hydrate: value => value as { name: string; age: number },
        },
      });

      // Access the value
      const user = getUser();

      // Original value is returned unchanged
      expect(user.name).toBe('John');

      // But the stored value is transformed
      expect(store.set).toHaveBeenCalledTimes(1);
      const storedValue = store.get(storageKey('user', [])) as PersistedValue<{ name: string; age: number }>;
      expect(storedValue[1].name).toBe('JOHN'); // Uppercase due to dehydrate
      expect(storedValue[1].age).toBe(30);
    });

    it('tracks dependencies during hydration', () => {
      // Create a dependency state
      const count = state(10);

      // Pre-populate store
      store.set(storageKey('double', []), ['value', 20]);

      // Create a reactive function that depends on count
      const double = reactive(
        () => {
          // This should never be called due to hydration
          return count.get() * 2;
        },
        {
          persist: {
            key: 'double',
            hydrate: value => {
              // This should track the dependency on count
              return count.get() * 2;
            },
          },
        },
      );

      // Access the value
      expect(double()).toBe(20);

      // Update the dependency
      count.set(20);

      // The reactive function should update due to the tracked dependency
      expect(double()).toBe(40);
    });
  });

  describe('ReactivePromise handling', () => {
    it('persists resolved promise values', async () => {
      // Create an async reactive function with persistence
      const fetchData = reactive(
        async () => {
          return { data: 'Async data' };
        },
        {
          persist: {
            key: 'async-data',
            hydrate: value => value as { data: string },
          },
        },
      );

      // Access the value to trigger computation
      const promise = fetchData();

      // Wait for the promise to resolve
      await promise;

      // Check that the value was stored with ReactivePromise format
      expect(store.set).toHaveBeenCalledTimes(1);
      const [, value] = store.get(storageKey('async-data', []))!;
      expect(value).toEqual({ data: 'Async data' });
    });

    it('hydrates promise into ready+resolved state', async () => {
      // Pre-populate store with a ReactivePromise format
      store.set(storageKey('async-data', []), serialize({ data: 'Stored async data' }, true));

      // Create a new reactive function
      const fetchData = reactive(
        async () => {
          // This should not be called
          return { data: 'This should not be called' };
        },
        {
          persist: {
            key: 'async-data',
            hydrate: value => value as { data: string },
          },
        },
      );

      // The restored promise should be in a ready+settled state
      const restoredPromise = fetchData();

      // No need to await - it should be immediately ready
      expect(restoredPromise.isPending).toBe(false);
      expect(restoredPromise.isSettled).toBe(true);
      expect(restoredPromise.isResolved).toBe(true);
      expect(restoredPromise.value).toEqual({ data: 'Stored async data' });
    });

    it('does not persist pending promises', async () => {
      // Create a promise that never resolves
      const neverResolve = new Promise(() => {});

      const fetchPending = reactive(() => neverResolve, {
        persist: {
          key: 'pending-data',
          hydrate: value => value,
        },
      });

      // Access the value
      fetchPending();

      // Give time for any potential storage operations
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify nothing was stored
      expect(store.set).not.toHaveBeenCalled();
    });

    it('does not persist rejected promises', async () => {
      // Create a promise that rejects
      const fetchRejected = reactive(
        async () => {
          throw new Error('Failed to fetch');
        },
        {
          persist: {
            key: 'rejected-data',
          },
        },
      );

      // Access the value and catch the rejection
      try {
        await fetchRejected();
      } catch (e) {
        // Expected
      }

      // Give time for any potential storage operations
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify nothing was stored
      expect(store.set).not.toHaveBeenCalled();
    });
  });

  describe('Args hashing', () => {
    it('stores different values for different arguments', () => {
      // Create a reactive function with arguments
      const multiply = reactive((a: number, b: number) => a * b, {
        persist: {
          key: 'multiply',
          hydrate: value => value as number,
        },
      });

      // Call with different arguments
      expect(multiply(2, 3)).toBe(6);
      expect(multiply(4, 5)).toBe(20);

      // Check that different keys were used for different arguments
      const allStored = store.getAll();
      const keys = Object.keys(allStored);

      // Should have two entries with different hashed keys
      expect(keys.length).toBe(2);
      expect(keys[0].startsWith('multiply:')).toBe(true);
      expect(keys[1].startsWith('multiply:')).toBe(true);
      expect(keys[0]).not.toBe(keys[1]);

      // Values should be stored correctly
      expect(Object.values(allStored)).toContainEqual(['value', 6]);
      expect(Object.values(allStored)).toContainEqual(['value', 20]);
    });

    it('hydrates correct values for different arguments', () => {
      // Pre-populate store with different arg values
      store.set(storageKey('multiply', [2, 3]), ['value', 6]);
      store.set(storageKey('multiply', [4, 5]), ['value', 20]);

      // Create a reactive function with arguments
      const multiply = reactive(
        (a: number, b: number) => {
          // This will be called for args that aren't in the store
          return a * b * 10; // Different result to verify hydration
        },
        {
          persist: {
            key: 'multiply',
            hydrate: value => value as number,
          },
        },
      );

      // Should return hydrated values for known args
      expect(multiply(2, 3)).toBe(6);
      expect(multiply(4, 5)).toBe(20);

      // Should compute for unknown args
      expect(multiply(3, 3)).toBe(90); // 3*3*10
    });
  });

  describe('Error handling', () => {
    it('silently handles storage errors', () => {
      // Enable fail mode on the mock store
      store.enableFailMode();

      // Create a reactive function
      const getGreeting = reactive(() => 'Hello, World!', {
        persist: {
          key: 'greeting',
          hydrate: value => value as string,
        },
      });

      // This should not throw even though storage fails
      expect(() => {
        const greeting = getGreeting();
        expect(greeting).toBe('Hello, World!');
      }).not.toThrow();
    });
  });
});
