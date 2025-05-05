---
title: React Integration
nextjs:
  metadata:
    title: React Integration
    description: Using Signalium with React
---

Signalium provides first-class integration with React through the `@signalium/react` package. This integration allows you to use signals directly in your React components while maintaining React's component model and lifecycle.

## Setup

First, you'll need to set up the React integration:

```tsx
import { setupReact } from '@signalium/react';

// Call this once at the root of your app
setupReact();
```

## Using Signals in Components

### useStateSignal

The `useStateSignal` hook creates a new signal that is scoped to a component's lifecycle:

```tsx
import { useStateSignal } from '@signalium/react';

function Counter() {
  const count = useStateSignal(0);

  return (
    <div>
      <p>Count: {count.get()}</p>
      <button onClick={() => count.set(count.get() + 1)}>Increment</button>
    </div>
  );
}
```

The signal created by `useStateSignal` will be automatically cleaned up when the component unmounts. This is the recommended way to create component-local state in Signalium.

### Using External Signals

You can use any signal directly in your components:

```tsx
import { state, reactive } from 'signalium';

const count = state(0);
const doubled = reactive(() => count.get() * 2);

function Counter() {
  return (
    <div>
      <p>Count: {count.get()}</p>
      <p>Doubled: {doubled()}</p>
      <button onClick={() => count.set(count.get() + 1)}>Increment</button>
    </div>
  );
}
```

### Migrating from useState to useStateSignal

When migrating existing React components from `useState` to Signalium, the transition is straightforward:

```tsx
// Before: Using React's useState
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}

// After: Using Signalium's useStateSignal
function Counter() {
  const count = useStateSignal(0);

  return (
    <div>
      <p>Count: {count.get()}</p>
      <button onClick={() => count.set(count.get() + 1)}>Increment</button>
    </div>
  );
}
```

Key differences to be aware of:

1. With `useStateSignal`, you need to call `.get()` to read the value
2. Use `.set()` instead of calling the setter function directly
3. If you prefer functional updates like `setCount(prev => prev + 1)` you can use `update()` instead of `set()` - `count.update(prev => prev + 1)`
4. The signal itself is stable - it doesn't change on re-renders

## Converting Existing Hooks

When converting existing React hooks to use Signalium, it's best to start from the leaves of your component tree and work your way up. Here's an example of incrementally converting a set of related hooks:

```tsx
// Step 1: Convert the most basic hook first
// Before
function useCounterWithStep(step = 1) {
  const [count, setCount] = useState(0);
  const increment = useCallback(() => setCount((c) => c + step), [step]);
  const decrement = useCallback(() => setCount((c) => c - step), [step]);
  return { count, increment, decrement };
}

// After
const count = state(0); // Move to module scope
const useCounterWithStep = reactive((step = 1) => {
  const increment = () => count.set(count.get() + step);
  const decrement = () => count.set(count.get() - step);

  return {
    get count() {
      return count.get();
    },
    increment,
    decrement,
  };
});

// Step 2: Convert a hook that uses the counter
// Before
function useCounterWithHistory() {
  const { count, increment, decrement } = useCounterWithStep();
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    setHistory((h) => [...h, count]);
  }, [count]);

  return { count, history, increment, decrement };
}

// After
const useCounterWithHistory = reactive(() => {
  return subscription((state) => {
    const { count, increment, decrement } = useCounterWithStep();

    state.set({
      count,
      increment,
      decrement,
      history: [...state.get()?.history, count],
    });
  });
});

// Usage in a component
function Counter() {
  // When used in components, signals work seamlessly
  const { count, history, increment, decrement } = useCounterWithHistory();

  return (
    <div>
      <p>Count: {count.get()}</p>
      <button onClick={increment}>Increment</button>
      <button onClick={decrement}>Decrement</button>
      <p>History: {history.get().join(', ')}</p>
    </div>
  );
}
```

This example demonstrates several important patterns:

1. Start by converting the most basic hooks first, moving state to module scope when appropriate
2. Use `reactive()` to wrap functions that need to react to signal changes
3. Keep signals at the module level when they need to be shared between hooks
4. Use `useStateSignal` only in components, not in hooks
5. Convert hooks one at a time, starting from the leaves of your dependency tree

## Async Data and Promises

Signalium's reactive promises work seamlessly with React components. However, there are some important things to note:

1. Reactive promises are always the same object instance, even when their value changes. This means that `React.memo` will not trigger a re-render when the promise's value updates:

```tsx
// This component will not re-render when the promise value changes
const MemoizedComponent = memo(({ promise }) => {
  return <div>{promise.value}</div>;
});

// Instead, use the value directly
const MemoizedComponent = memo(({ value }) => {
  return <div>{value}</div>;
});

function Parent() {
  const data = useData(); // returns a reactive promise
  return <MemoizedComponent value={data.value} />;
}
```

2. When using reactive promises in components, you can handle loading and error states:

```tsx
function DataComponent() {
  const data = useData(); // returns a reactive promise

  if (data.isPending) {
    return <div>Loading...</div>;
  }

  if (data.isRejected) {
    return <div>Error: {String(data.error)}</div>;
  }

  return <div>{data.value}</div>;
}
```

## Contexts

Signalium's context system integrates with React's context system through the `ContextProvider` component:

```tsx
import { ContextProvider } from '@signalium/react';
import { createContext, state } from 'signalium';

const ThemeContext = createContext(state('light'));

function App() {
  return (
    <ContextProvider contexts={[[ThemeContext, state('dark')]]}>
      <YourApp />
    </ContextProvider>
  );
}

function ThemedComponent() {
  const theme = useContext(ThemeContext);
  return <div>Current theme: {theme.get()}</div>;
}
```

Multiple contexts can be provided to the `ContextProvider` component, removing the need to nest many context providers in your component tree:

```tsx
<ContextProvider
  contexts={[
    [ThemeContext, state('dark')],
    [OtherContext, state('foo')],
  ]}
>
  <YourApp />
</ContextProvider>
```

## Best Practices

1. Use `useStateSignal` for component-local state
2. Keep signals as close as possible to where they're used
3. When using reactive promises with `React.memo`, pass the resolved value rather than the promise itself
4. Use contexts for dependency injection and global state
5. Convert hooks from the leaves of your component tree upward
6. Remember that reactive promises are always the same object instance

## Edge Cases and Gotchas

1. **Reactive Promises and React.memo**: As mentioned above, reactive promises are always the same object instance. This means that `React.memo` will not trigger a re-render when the promise's value updates. Always pass the resolved value to memoized components.

2. **Component Re-renders**: Signalium's reactivity system is independent of React's rendering system. This means that when a signal updates, only components that actually use that signal will re-render, regardless of their position in the component tree.

3. **Strict Mode**: Signalium works correctly with React's Strict Mode. The `useStateSignal` hook is designed to handle the double-rendering behavior of Strict Mode.

4. **Server Components**: Signalium is designed to work with React Server Components. However, you should be careful about which signals you use in server components, as they will be serialized and sent to the client.

5. **Concurrent Mode**: Signalium is compatible with React's Concurrent Mode. The reactivity system will work correctly even when React interrupts and resumes rendering.
