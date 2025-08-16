---
title: API Docs
nextjs:
  metadata:
    title: Signalium API Docs
    description: Signalium API Docs
---

## signalium

### state

```ts
export function state<T>(
  initialValue: T,
  opts?: SignalOptions<T>,
): StateSignal<T>;
```

Creates a new state signal with the given initial value. State signals are mutable values that can trigger reactivity when they change.

#### StateSignal<T> Interface

```ts
interface StateSignal<T> {
  get(): T; // Get the current value
  set(value: T): void; // Set a new value
  update(updater: (value: T) => T): void; // Update using a function
  peek(): T; // Get the value without creating a dependency
}
```

### reactive

```ts
export function reactive<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts?: SignalOptions<T, Args>,
): (...args: Args) => ReactiveValue<T>;
```

Creates a reactive function that tracks dependencies and automatically updates when those dependencies change.

### task

```ts
export function task<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  opts?: SignalOptions<T, Args>,
): ReactiveTask<T, Args>;
```

Creates a reactive task for handling asynchronous operations. Tasks are similar to reactive functions but are specialized for promises.

#### ReactiveTask<T, Args> Interface

```ts
interface ReactiveTask<T, Args extends unknown[]>
  extends ReactivePromise<T, Args> {
  run(...args: Args): ReactivePromise<T>; // Manually trigger the task
}
```

### subscription

```ts
export function subscription<T, Args extends unknown[]>(
  fn: SignalSubscribe<T, Args>,
  opts?: SignalOptionsWithInit<T, Args>,
): ReactiveSubscription<T>;
```

Creates a reactive subscription for handling long-running, asymmetric async operations like websockets, polling, or event listeners.

#### ReactiveSubscription<T> Interface

```ts
interface ReactiveSubscription<T> extends ReactivePromise<T> {
  rerun(): void; // Manually trigger the subscription to rerun
}
```

### watcher

```ts
export function watcher<T>(fn: () => T): Watcher<T>;
```

Creates a watcher that listens to updates from signals externally. Watchers are how signals are consumed by frameworks and applications.

### callback

```ts
export function callback<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
): (...args: Args) => T;
```

Creates a callback function that is owned by the current reactive context. This essentially allows you to use the same contexts as the owner within the callback

### context

```ts
export function context<T>(initialValue: T, description?: string): Context<T>;
```

Creates a context that can be used to provide values to a subtree of reactive functions.

### useContext

```ts
export function useContext<T>(context: Context<T>): T;
```

Retrieves the value from a context. Must be called within a reactive function or a component that has a parent provider.

### withContexts

```ts
export function withContexts<C extends unknown[], U>(
  contexts: [...ContextPair<C>],
  fn: () => U,
): U;
```

Executes a function with the provided context values, making them available to any reactive function called within.

#### Watcher<T> Interface

```ts
interface Watcher<T> {
  addListener(listener: (value: T) => void): () => void; // Add a listener for changes
  get(): T; // Get the current value and track dependencies
  peek(): T; // Get the current value without tracking dependencies
}
```

### isReactivePromise

```ts
export function isReactivePromise<T, Args extends unknown[]>(
  obj: unknown,
): boolean;
```

Checks if a value is a reactive promise.

### isReactiveTask

```ts
export function isReactiveTask<T, Args extends unknown[]>(
  obj: unknown,
): boolean;
```

Checks if a value is a reactive task.

### isReactiveSubscription

```ts
export function isReactiveSubscription<T, Args extends unknown[]>(
  obj: unknown,
): boolean;
```

Checks if a value is a reactive subscription.

### hashValue

```ts
export function hashValue(value: unknown): number;
```

Generates a consistent hash for a value. Used internally for caching and memoization.

### registerCustomHash

```ts
export function registerCustomHash<T>(
  ctor: { new (): T },
  hashFn: (obj: T) => number,
): void;
```

Registers a custom hash function for a specific class. Useful for objects that need special equality considerations.

## signalium/react

### setupReact

```ts
export function setupReact(): void;
```

Initializes the React integration. Call this once at or near the root of your application.

### useStateSignal

```ts
export function useStateSignal<T>(
  value: T,
  opts?: SignalOptions<T, unknown[]>,
): StateSignal<T>;
```

Creates a component-scoped state signal that will be cleaned up when the component unmounts.

### ContextProvider

```tsx
export function ContextProvider({
  contexts,
  children,
}: {
  contexts: ContextPair<unknown[]>;
  children: React.ReactNode;
}): React.ReactElement;
```

A component that provides multiple Signalium contexts to a React component tree.
