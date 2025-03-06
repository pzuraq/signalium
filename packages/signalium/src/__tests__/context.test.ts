import { describe, expect, test } from 'vitest';
import { createContext, useContext, withContexts, state } from '../index.js';
import { permute } from './utils/permute.js';
import { nextTick } from './utils/async.js';
import { reactive } from './utils/instrumented-hooks.js';

describe('contexts', () => {
  test('throws when useContext is used outside of a signal', () => {
    expect(() => {
      useContext(createContext('test'));
    }).toThrow('useContext must be used within a signal hook');
  });

  test('async computed maintains context ownership across await boundaries', async () => {
    const ctx = createContext('default');

    const inner = reactive(async () => {
      await Promise.resolve();
      return 'inner-value';
    });

    const outer = reactive(async () => {
      const result = await inner();

      // Use context after awaiting inner result
      const contextValue = useContext(ctx);
      return result + '-' + contextValue;
    });

    // Test in parent scope
    expect(outer).toHaveValueAndCounts(undefined, { compute: 1 });

    // Wait for async computation to complete
    await nextTick();
    await nextTick();
    expect(outer).toHaveValueAndCounts('inner-value-default', { compute: 1 });

    // Test in child scope
    expect(outer.withContexts([ctx, 'child'])).toHaveValueAndCounts(undefined, { compute: 1 });

    // Verify parent scope maintains separate computed
    await nextTick();
    await nextTick();

    expect(outer.withContexts([ctx, 'child'])).toHaveValueAndCounts('inner-value-child', { compute: 1 });
    expect(outer).toHaveValueAndCounts('inner-value-default', { compute: 1 });
  });

  test('async task maintains context ownership across await boundaries', async () => {
    const ctx = createContext('default');

    const task = reactive(async () => {
      await Promise.resolve();
    });
  });

  permute(1, create => {
    test('computed signals are cached per context scope', async () => {
      const ctx = createContext('default');
      const value = state(0);

      const computed = create(
        () => {
          return useContext(ctx) + value.get();
        },
        {
          desc: 'subscription',
        },
      );

      computed();

      await nextTick();

      // Same scope should reuse computation
      expect(computed).toHaveSignalValue('default0').toMatchSnapshot();
      expect(computed).toHaveSignalValue('default0').toMatchSnapshot();

      const result = withContexts([[ctx, 'other']], () => {
        // Different scope should compute again
        return computed();
      });

      await nextTick();

      expect(computed.withContexts([ctx, 'other']))
        .toHaveSignalValue('other0')
        .toMatchSnapshot();
      expect(computed.withContexts([ctx, 'other']))
        .toHaveSignalValue('other0')
        .toMatchSnapshot();

      expect(computed).toHaveSignalValue('default0').toMatchSnapshot();
    });

    // test.skip('computed forks when accessing forked context after being shared', async () => {
    //   const ctx = createContext('default');
    //   const value = state(0);

    //   const computed = create(() => {
    //     // Initially only depends on value, not context
    //     const v = value.get();
    //     if (v > 0) {
    //       // After value changes, depends on context
    //       return useContext(ctx);
    //     }
    //     return 'default';
    //   });

    //   // Initially computed is shared between scopes since it doesn't use context
    //   expect(computed).withContexts([ctx, 'scope1']).toHaveValueAndCounts('default', { compute: 1 });
    //   expect(computed).withContexts([ctx, 'scope2']).toHaveValueAndCounts('default', { compute: 1 });

    //   // Change value to make computed use context
    //   value.set(1);

    //   await nextTick();

    //   // Now computed should fork and use the different context values
    //   expect(computed).withContexts([ctx, 'scope1']).toHaveValueAndCounts('scope1', { compute: 3 });
    //   expect(computed).withContexts([ctx, 'scope2']).toHaveValueAndCounts('scope2', { compute: 3 });

    //   // Ensure that computed is cached correctly
    //   expect(computed).withContexts([ctx, 'scope1']).toHaveValueAndCounts('scope1', { compute: 3 });
    //   expect(computed).withContexts([ctx, 'scope2']).toHaveValueAndCounts('scope2', { compute: 3 });
    // });

    // test.skip('computed forks correctly regardless of access order', () => {
    //   const ctx = createContext('default');
    //   const value = state(0);

    //   const computed = create(() => {
    //     // Initially only depends on value, not context
    //     const v = value.get();
    //     if (v > 0) {
    //       // After value changes, depends on context
    //       return useContext(ctx);
    //     }
    //     return v;
    //   });

    //   // Create two scopes with different context values, but access in reverse order
    //   expect(computed).withContexts([ctx, 'scope1']).toHaveValueAndCounts(0, { compute: 1 });

    //   expect(computed).withContexts([ctx, 'scope2']).toHaveValueAndCounts(0, { compute: 1 }); // Still shared since no context dependency

    //   // Change value to make computed use context
    //   value.set(1);

    //   // Now computed should fork and use the different context values
    //   // Access in reverse order compared to first test
    //   expect(computed).withContexts([ctx, 'scope2']).toHaveValueAndCounts('scope2', { compute: 2 });

    //   expect(computed).withContexts([ctx, 'scope1']).toHaveValueAndCounts('scope1', { compute: 3 });

    //   // Ensure that computed is cached correctly
    //   expect(computed).withContexts([ctx, 'scope1']).toHaveValueAndCounts('scope1', { compute: 3 });

    //   expect(computed).withContexts([ctx, 'scope2']).toHaveValueAndCounts('scope2', { compute: 3 });
    // });

    // test.skip('computed ownership transfers correctly between parent and child scopes', () => {
    //   const ctx = createContext('default');
    //   const value = state(0);

    //   const computed = create(() => {
    //     // Initially only depends on value, not context
    //     const v = value.get();
    //     if (v > 0) {
    //       // After value changes, depends on context
    //       return useContext(ctx) + v;
    //     }
    //     return v;
    //   });

    //   // Initially access in parent scope
    //   expect(computed).toHaveValueAndCounts(0, { compute: 1 });

    //   // Child scope reuses original computed instance since no context dependency
    //   expect(computed).withContexts([ctx, 'child']).toHaveValueAndCounts(0, { compute: 1 });

    //   // Change value to make computed use context
    //   value.set(1);

    //   // Child scope takes ownership of parent instance
    //   expect(computed).withContexts([ctx, 'child']).toHaveValueAndCounts('child1', { compute: 2 });

    //   // Parent scope gets its own computed instance
    //   expect(computed).toHaveValueAndCounts('default1', { compute: 3 });

    //   // Third scope gets its own computed instance
    //   expect(computed).withContexts([ctx, 'third']).toHaveValueAndCounts('third1', { compute: 4 });

    //   // Ensure computeds are cached correctly
    //   expect(computed).withContexts([ctx, 'child']).toHaveValueAndCounts('child1', { compute: 4 });

    //   expect(computed).toHaveValueAndCounts('default1', { compute: 4 });

    //   // Verify all scopes maintain their separate computeds
    //   value.set(2);

    //   expect(computed).withContexts([ctx, 'child']).toHaveValueAndCounts('child2', { compute: 5 });

    //   expect(computed).toHaveValueAndCounts('default2', { compute: 6 });

    //   expect(computed).withContexts([ctx, 'third']).toHaveValueAndCounts('third2', { compute: 7 });
    // });
  });

  permute(2, (create1, create2) => {
    test('contexts are properly scoped', async () => {
      const ctx = createContext('default');

      const computed1 = create1(() => {
        return useContext(ctx);
      });

      computed1.watch();

      await nextTick();

      expect(computed1).toHaveSignalValue('default').toMatchSnapshot();

      const computed2 = create2(() => {
        return withContexts([[ctx, 'override']], () => {
          return computed1();
        });
      });

      computed2.watch();

      await nextTick();

      expect(computed2).toHaveSignalValue('override').toMatchSnapshot();
      // expect(computed1).toHaveSignalValue('default').toMatchSnapshot();
    });

    // test.skip('context dependencies are tracked correctly', () => {
    //   const ctx1 = createContext('default1');
    //   const ctx2 = createContext('default2');

    //   const computed1 = create1(() => {
    //     // Only depends on ctx1
    //     return useContext(ctx1);
    //   });

    //   const computed2 = create2(() => {
    //     // Depends on both contexts
    //     return computed1() + useContext(ctx2);
    //   });

    //   expect(computed2).toHaveValueAndCounts('default1default2', { compute: 1 });
    //   expect(computed1).toHaveCounts({ compute: 1 });

    //   expect(computed2).withContexts([ctx1, 'override1']).toHaveValueAndCounts('override1default2', { compute: 2 });
    //   expect(computed1).toHaveCounts({ compute: 2 });

    //   expect(computed2).withContexts([ctx2, 'override2']).toHaveValueAndCounts('default1override2', { compute: 3 });
    //   expect(computed1).toHaveCounts({ compute: 2 });

    //   expect(computed2)
    //     .withContexts([ctx1, 'override1'], [ctx2, 'override2'])
    //     .toHaveValueAndCounts('override1override2', { compute: 4 });
    //   expect(computed1).toHaveCounts({ compute: 3 });

    //   // Should reuse cached value since ctx2 didn't change
    //   expect(computed1).withContexts([ctx2, 'override1']).toHaveValueAndCounts('default1', { compute: 3 });
    // });

    test('context scopes inherit from parent scope when nested in computeds', async () => {
      const ctx1 = createContext('default1');
      const ctx2 = createContext('default2');

      const computed1 = create1(() => {
        return useContext(ctx1) + useContext(ctx2);
      });

      const computed2 = create2(() => {
        return (
          useContext(ctx2) +
          withContexts([[ctx2, ':inner-override2']], () => {
            return computed1();
          })
        );
      });

      computed2.watch();
      computed2.withContexts([ctx1, 'override1']).watch();
      computed2.withContexts([ctx2, 'override2']).watch();
      computed2.withContexts([ctx1, 'override1'], [ctx2, 'override2']).watch();

      await nextTick();

      expect(computed2).toHaveSignalValue('default2default1:inner-override2').toMatchSnapshot();
      expect(computed1).toMatchSnapshot();

      expect(computed2.withContexts([ctx1, 'override1']))
        .toHaveSignalValue('default2override1:inner-override2')
        .toMatchSnapshot();
      expect(computed1).toMatchSnapshot();

      await nextTick();

      expect(computed2.withContexts([ctx1, 'override1'], [ctx2, 'override2']))
        .toHaveSignalValue('override2override1:inner-override2')
        .toMatchSnapshot();
      expect(computed1).toMatchSnapshot();

      expect(computed2.withContexts([ctx2, 'override2']))
        .toHaveSignalValue('override2default1:inner-override2')
        .toMatchSnapshot();
      expect(computed1).toMatchSnapshot();
    });
  });

  // permute(3, (create1, create2, create3) => {
  //   test.skip('the gauntlet (params + state + context)', async () => {
  //     const ctx = createContext('ctxdefault');
  //     const value = state('value');

  //     const inner1 = create1((a: number) => {
  //       if (a === 3) {
  //         return ['inner1', useContext(ctx)];
  //       } else if (a === 4) {
  //         return ['inner1', value.get()];
  //       }

  //       return ['inner1'];
  //     });

  //     const inner2 = create2((a: number) => {
  //       if (a === 3) {
  //         return value.get() === 'value' ? ['inner2'] : ['inner2', useContext(ctx)];
  //       } else if (a === 4) {
  //         return withContexts([[ctx, 'ctxinneroverride']], () => {
  //           return ['inner2', inner1(3), value.get()];
  //         });
  //       }

  //       return ['inner2', inner1(a)];
  //     });

  //     const outer = create3((a: number) => {
  //       if (a === 1) {
  //         return [inner1(1), inner2(2)];
  //       } else if (a === 2) {
  //         return [inner1(2), inner2(3)];
  //       } else if (a === 3) {
  //         return [inner1(3), inner2(4)];
  //       } else if (a === 4) {
  //         return [useContext(ctx), inner2(4)];
  //       } else if (a === 5) {
  //         return [inner1(5), value.get()];
  //       }
  //     });

  //     // a === 1
  //     expect(outer)
  //       .withParams(1)
  //       .toHaveValueAndCounts([['inner1'], ['inner2', ['inner1']]], { compute: 1 });
  //     expect(inner1).toHaveCounts({ compute: 2 });
  //     expect(inner2).toHaveCounts({ compute: 1 });

  //     expect(outer)
  //       .withContexts([ctx, 'ctxoverride'])
  //       .withParams(1)
  //       .toHaveValueAndCounts([['inner1'], ['inner2', ['inner1']]], { compute: 1 });
  //     expect(inner1).toHaveCounts({ compute: 2 });
  //     expect(inner2).toHaveCounts({ compute: 1 });

  //     // a === 2
  //     expect(outer)
  //       .withParams(2)
  //       .toHaveValueAndCounts([['inner1'], ['inner2']], {
  //         compute: 2,
  //       });
  //     expect(inner1).toHaveCounts({ compute: 2 });
  //     expect(inner2).toHaveCounts({ compute: 2 });

  //     expect(outer)
  //       .withParams(2)
  //       .withContexts([ctx, 'ctxoverride'])
  //       .toHaveValueAndCounts([['inner1'], ['inner2']], {
  //         compute: 2,
  //       });
  //     expect(inner1).toHaveCounts({ compute: 2 });
  //     expect(inner2).toHaveCounts({ compute: 2 });

  //     // a === 3
  //     expect(outer)
  //       .withParams(3)
  //       .toHaveValueAndCounts(
  //         [
  //           ['inner1', 'ctxdefault'],
  //           ['inner2', ['inner1', 'ctxinneroverride'], 'value'],
  //         ],
  //         {
  //           compute: 3,
  //         },
  //       );
  //     expect(inner1).toHaveCounts({ compute: 4 });
  //     expect(inner2).toHaveCounts({ compute: 3 });

  //     expect(outer)
  //       .withParams(3)
  //       .withContexts([ctx, 'ctxoverride'])
  //       .toHaveValueAndCounts(
  //         [
  //           ['inner1', 'ctxoverride'],
  //           ['inner2', ['inner1', 'ctxinneroverride'], 'value'],
  //         ],
  //         {
  //           compute: 4,
  //         },
  //       );
  //     expect(inner1).toHaveCounts({ compute: 6 });
  //     expect(inner2).toHaveCounts({ compute: 4 });

  //     // a === 4
  //     expect(outer)
  //       .withParams(4)
  //       .toHaveValueAndCounts(['ctxdefault', ['inner2', ['inner1', 'ctxinneroverride'], 'value']], {
  //         compute: 5,
  //       });
  //     expect(inner1).toHaveCounts({ compute: 6 });
  //     expect(inner2).toHaveCounts({ compute: 4 });

  //     expect(outer)
  //       .withParams(4)
  //       .withContexts([ctx, 'ctxoverride'])
  //       .toHaveValueAndCounts(['ctxoverride', ['inner2', ['inner1', 'ctxinneroverride'], 'value']], {
  //         compute: 6,
  //       });
  //     expect(inner1).toHaveCounts({ compute: 6 });
  //     expect(inner2).toHaveCounts({ compute: 4 });

  //     // a === 5
  //     expect(outer)
  //       .withParams(5)
  //       .toHaveValueAndCounts([['inner1'], 'value'], {
  //         compute: 7,
  //       });
  //     expect(inner1).toHaveCounts({ compute: 7 });
  //     expect(inner2).toHaveCounts({ compute: 4 });

  //     expect(outer)
  //       .withParams(5)
  //       .withContexts([ctx, 'ctxoverride'])
  //       .toHaveValueAndCounts([['inner1'], 'value'], {
  //         compute: 8,
  //       });
  //     expect(inner1).toHaveCounts({ compute: 8 });
  //     expect(inner2).toHaveCounts({ compute: 4 });

  //     value.set('value2');
  //     await nextTick();

  //     // a === 1
  //     expect(outer)
  //       .withParams(1)
  //       .toHaveSignalValue([['inner1'], ['inner2', ['inner1']]]);

  //     expect(outer)
  //       .withContexts([ctx, 'ctxoverride'])
  //       .withParams(1)
  //       .toHaveSignalValue([['inner1'], ['inner2', ['inner1']]]);

  //     // a === 2
  //     expect(outer)
  //       .withParams(2)
  //       .toHaveSignalValue([['inner1'], ['inner2', 'ctxdefault']]);

  //     expect(outer)
  //       .withParams(2)
  //       .withContexts([ctx, 'ctxoverride'])
  //       .toHaveSignalValue([['inner1'], ['inner2', 'ctxoverride']]);

  //     // a === 3
  //     expect(outer)
  //       .withParams(3)
  //       .toHaveSignalValue([
  //         ['inner1', 'ctxdefault'],
  //         ['inner2', ['inner1', 'ctxinneroverride'], 'value2'],
  //       ]);

  //     expect(outer)
  //       .withParams(3)
  //       .withContexts([ctx, 'ctxoverride'])
  //       .toHaveSignalValue([
  //         ['inner1', 'ctxoverride'],
  //         ['inner2', ['inner1', 'ctxinneroverride'], 'value2'],
  //       ]);

  //     // a === 4
  //     expect(outer)
  //       .withParams(4)
  //       .toHaveSignalValue(['ctxdefault', ['inner2', ['inner1', 'ctxinneroverride'], 'value2']]);

  //     expect(outer)
  //       .withParams(4)
  //       .withContexts([ctx, 'ctxoverride'])
  //       .toHaveSignalValue(['ctxoverride', ['inner2', ['inner1', 'ctxinneroverride'], 'value2']]);

  //     // a === 5
  //     expect(outer)
  //       .withParams(5)
  //       .toHaveSignalValue([['inner1'], 'value2']);
  //     expect(outer)
  //       .withParams(5)
  //       .withContexts([ctx, 'ctxoverride'])
  //       .toHaveSignalValue([['inner1'], 'value2']);

  //     expect(inner1).toHaveCounts({ compute: 10 });
  //     expect(inner2).toHaveCounts({ compute: 9 });
  //   });
  // });
});
