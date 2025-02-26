import type { SignalScope } from './hooks.js';

export interface Signal<T = unknown> {
  get(): T;
}

export interface WriteableSignal<T> extends Signal<T> {
  set(value: T): void;
}

export type AsyncSignal<T> = Signal<AsyncResult<T>>;

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

export interface SignalOptions<T, Args extends unknown[]> {
  equals?: SignalEquals<T> | false;
  id?: string;
  desc?: string;
  params?: string;
  scope?: SignalScope;
  paramKey?: (...args: Args) => string;
}

export interface SignalOptionsWithInit<T, Args extends unknown[]> extends SignalOptions<T, Args> {
  initValue: T;
}

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

export interface AsyncTask<T, RunArgs extends unknown[] = unknown[]> {
  result: T | undefined;
  error: unknown;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  isReady: boolean;

  run(...args: RunArgs): Promise<T>;
}

export interface WatcherListenerOptions {
  immediate?: boolean;
}

export interface Watcher<T> {
  addListener(listener: (value: T) => void, opts?: WatcherListenerOptions): () => void;
}
