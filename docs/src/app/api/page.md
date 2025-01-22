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
): WriteableSignal<T>;
```

### computed

```ts
export function computed<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts?: SignalOptions<T, Args>,
): (...args: Args) => T;
```

### asyncComputed

```ts
export function asyncComputed<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts?: SignalOptionsWithInit<T, Args>,
): (...args: Args) => AsyncResult<T>;
```

### asyncTask

```ts
export function asyncTask<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts?: SignalOptions<T, Args>,
): (...args: Args) => AsyncTask<T>;
```

### subscription

```ts
export function subscription<T, Args extends unknown[]>(
  fn: SignalSubscribe<T, Args>,
  opts?: SignalOptionsWithInit<T, Args>,
): (...args: Args) => T;
```

### watcher

```ts
export function watcher<T>(
  fn: (prev: T | undefined) => T,
  opts?: SignalOptions<T>,
): Watcher<T>;
```

## Types

```ts
// ===========================
//           Signals
// ===========================

export interface Signal<T = unknown> {
  get(): T;
}

export interface WriteableSignal<T> extends Signal<T> {
  set(value: T): void;
}

export type AsyncSignal<T> = Signal<AsyncResult<T>>;

// ===========================
//      Signal Parameters
// ===========================

export type SignalCompute<T> = (prev: T | undefined) => T;

export type SignalAsyncCompute<T> = (prev: T | undefined) => T | Promise<T>;

export type SignalEquals<T> = (prev: T, next: T) => boolean;

export type SignalSubscription = {
  update?(): void;
  unsubscribe?(): void;
};

export type SignalSubscribe<T> = (
  get: () => T | undefined,
  set: (value: T) => void,
) => SignalSubscription | undefined | void;

export interface SignalOptions<T> {
  equals?: SignalEquals<T> | false;
  id?: string;
  desc?: string;
  params?: string;
  paramKey?: (...args: Args) => string;
  scope?: SignalScope;
}

export interface SignalOptionsWithInit<T> extends SignalOptions<T> {
  initValue: T;
}

// ===========================
//            Async
// ===========================

export interface AsyncBaseResult<T> {
  invalidate(): void;
  await(): T;
}

export interface AsyncPending<T> extends AsyncBaseResult<T> {
  result: undefined;
  error: unknown;
  isPending: boolean;
  isReady: false;
  isError: boolean;
  isSuccess: boolean;
  didResolve: boolean;
}

export interface AsyncReady<T> extends AsyncBaseResult<T> {
  result: T;
  error: unknown;
  isPending: boolean;
  isReady: true;
  isError: boolean;
  isSuccess: boolean;
  didResolve: boolean;
}

export type AsyncResult<T> = AsyncPending<T> | AsyncReady<T>;

export interface AsyncTask<T, Args extends unknown[] = unknown[]> {
  result: T | undefined;
  error: unknown;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  isReady: boolean;

  run(...args: Args): Promise<T>;
}

// ===========================
//          Watchers
// ===========================

export interface WatcherListenerOptions {
  immediate?: boolean;
}

export interface Watcher<T> {
  addListener(
    listener: (value: T) => void,
    opts?: WatcherListenerOptions,
  ): () => void;
}
```
