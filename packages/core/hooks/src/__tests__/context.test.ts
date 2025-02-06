import { describe, expect, test } from 'vitest';
import { createComputed, createContext, ROOT_SCOPE, useContext, withContext } from '../context.js';
import { state } from 'signalium';

describe('contexts', () => {
  test('throws when useContext is used outside of a signal', () => {
    expect(() => {
      useContext(createContext('test'));
    }).toThrow('useContext must be used within a signal hook');
  });

  test('contexts are properly scoped', () => {
    const ctx = createContext('default');
    const value = state('test');

    const computed1 = createComputed(() => {
      return useContext(ctx);
    });

    expect(computed1()).toBe('default');

    const computed2 = createComputed(() => {
      return withContext({ [ctx]: 'override' }, () => {
        return computed1();
      });
    });

    expect(computed2()).toBe('override');
    expect(computed1()).toBe('default');
  });

  test('computed signals are cached per context scope', () => {
    const ctx = createContext('default');
    const value = state(0);

    let computeCount = 0;

    const computed = createComputed(() => {
      computeCount++;
      return useContext(ctx) + value.get();
    });

    // Same scope should reuse computation
    expect(computeCount).toBe(0);
    expect(computed()).toBe('default0');
    expect(computed()).toBe('default0');
    expect(computeCount).toBe(1);

    const result = withContext({ [ctx]: 'other' }, () => {
      // Different scope should compute again
      return computed();
    });

    expect(computeCount).toBe(2);
    expect(result).toBe('other0');
    expect(computed()).toBe('default0');
  });

  test('context dependencies are tracked correctly', () => {
    const ctx1 = createContext('ctx1');
    const ctx2 = createContext('ctx2');
    const value = state(0);

    const computed1 = createComputed(() => {
      // Only depends on ctx1
      return useContext(ctx1);
    });

    const result1 = withContext({ [ctx1]: 'override1', [ctx2]: 'override2' }, () => {
      const computed2 = createComputed(() => {
        // Depends on both contexts
        return useContext(ctx1) + useContext(ctx2);
      });
      return computed2();
    });

    expect(computed1()).toBe('ctx1');
    expect(result1).toBe('override1override2');

    // Should reuse cached value since ctx2 didn't change
    const result2 = withContext({ [ctx2]: 'different' }, () => {
      return computed1();
    });

    expect(result2).toBe('ctx1');
  });

  test('context scopes inherit from parent scope when nested in computeds', () => {
    const ctx1 = createContext('default1');
    const ctx2 = createContext('default2');

    const computed = createComputed(() => {
      return withContext({ [ctx2]: 'override2' }, () => {
        return useContext(ctx1) + useContext(ctx2);
      });
    });

    const result = withContext({ [ctx1]: 'override1' }, () => {
      return computed();
    });

    expect(result).toBe('override1override2');
  });

  test('computed forks when accessing forked context after being shared', () => {
    const ctx = createContext('default');
    const value = state(0);
    let computeCount = 0;

    const computed = createComputed(() => {
      computeCount++;
      // Initially only depends on value, not context
      const v = value.get();
      if (v > 0) {
        // After value changes, depends on context
        return useContext(ctx) + v;
      }
      return v;
    });

    // Create two scopes with different context values
    const scope1Result = withContext({ [ctx]: 'scope1' }, () => computed());
    const scope2Result = withContext({ [ctx]: 'scope2' }, () => computed());

    // Initially computed is shared between scopes since it doesn't use context
    expect(scope1Result).toBe(0);
    expect(scope2Result).toBe(0);
    expect(computeCount).toBe(1); // Only computed once since it's shared

    // Change value to make computed use context
    value.set(1);

    // Now computed should fork and use the different context values
    const scope1UpdatedResult = withContext({ [ctx]: 'scope1' }, () => computed());
    const scope2UpdatedResult = withContext({ [ctx]: 'scope2' }, () => computed());

    expect(scope1UpdatedResult).toBe('scope11');
    expect(scope2UpdatedResult).toBe('scope21');
    expect(computeCount).toBe(3); // Computed once for each scope after forking
  });

  test('computed forks correctly regardless of access order', () => {
    const ctx = createContext('default');
    const value = state(0);
    let computeCount = 0;

    const computed = createComputed(() => {
      computeCount++;
      // Initially only depends on value, not context
      const v = value.get();
      if (v > 0) {
        // After value changes, depends on context
        return useContext(ctx) + v;
      }
      return v;
    });

    // Create two scopes with different context values, but access in reverse order
    const scope1Result = withContext({ [ctx]: 'scope1' }, () => computed());
    const scope2Result = withContext({ [ctx]: 'scope2' }, () => computed());

    // Initially computed is shared between scopes since it doesn't use context
    expect(scope1Result).toBe(0);
    expect(scope2Result).toBe(0);
    expect(computeCount).toBe(1); // Only computed once since it's shared

    // Change value to make computed use context
    value.set(1);

    // Now computed should fork and use the different context values
    // Access in reverse order compared to first test
    const scope2UpdatedResult = withContext({ [ctx]: 'scope2' }, () => computed());
    const scope1UpdatedResult = withContext({ [ctx]: 'scope1' }, () => computed());

    expect(scope2UpdatedResult).toBe('scope21');
    expect(scope1UpdatedResult).toBe('scope11');
    expect(computeCount).toBe(3); // Computed once for each scope after forking
  });

  test('computed ownership transfers correctly between parent and child scopes', () => {
    const ctx = createContext('default');
    const value = state(0);
    let computeCount = 0;

    const computed = createComputed(() => {
      computeCount++;
      const v = value.get();
      return useContext(ctx) + v;
    });

    // Initially access in parent scope
    const parentResult = computed();
    expect(parentResult).toBe('default0');
    expect(computeCount).toBe(1);

    // Child scope takes ownership by using context
    const childResult = withContext({ [ctx]: 'child' }, () => computed());
    expect(childResult).toBe('child0');
    expect(computeCount).toBe(2);

    // Parent scope access creates new computed instance
    const parentResult2 = computed();
    expect(parentResult2).toBe('default0');
    expect(computeCount).toBe(3);

    // Third scope creates its own computed instance
    const thirdResult = withContext({ [ctx]: 'third' }, () => computed());
    expect(thirdResult).toBe('third0');
    expect(computeCount).toBe(4);

    // Verify all scopes maintain their separate computeds
    value.set(1);

    const updatedChildResult = withContext({ [ctx]: 'child' }, () => computed());
    const updatedParentResult = computed();
    const updatedThirdResult = withContext({ [ctx]: 'third' }, () => computed());

    expect(updatedChildResult).toBe('child1');
    expect(updatedParentResult).toBe('default1');
    expect(updatedThirdResult).toBe('third1');
    expect(computeCount).toBe(7); // Each scope recomputed once
  });
});
