import { SignalScope } from './internals/contexts.js';

export interface Signal<T = unknown> {
  get(): T;
  addListener(listener: SignalListener): () => void;
}

export interface WriteableSignal<T> extends Signal<T> {
  set(value: T): void;
}

export type SignalEquals<T> = (prev: T, next: T) => boolean;

export type SignalListener = () => void;

export type SignalSubscription = {
  update?(): void;
  unsubscribe?(): void;
};

export interface SubscriptionState<T> {
  get: () => T | undefined;
  set: (value: T | Promise<T>) => void;
  setError: (error: unknown) => void;
}

export type SignalSubscribe<T> = (
  state: SubscriptionState<T>,
) => SignalSubscription | (() => unknown) | undefined | void;

export interface SignalOptions<T, Args extends unknown[]> {
  equals?: SignalEquals<T> | false;
  id?: string;
  desc?: string;
  scope?: SignalScope;
  paramKey?: (...args: Args) => string;
}

export interface SignalOptionsWithInit<T, Args extends unknown[]> extends SignalOptions<T, Args> {
  initValue: T extends Promise<infer U> ? U : T extends Generator<any, infer U, any> ? U : T;
}

export interface Thenable<T> {
  then(onfulfilled?: (value: T) => void, onrejected?: (reason: unknown) => void): void;
  finally: any;
  catch: any;
  [Symbol.toStringTag]: string;
}

export interface BaseReactivePromise<T> extends Promise<T> {
  value: T | undefined;
  error: unknown;

  isPending: boolean;
  isRejected: boolean;
  isResolved: boolean;
  isSettled: boolean;
  isReady: boolean;

  rerun(): void;
}

export interface PendingReactivePromise<T> extends BaseReactivePromise<T> {
  value: undefined;
  isReady: false;
}

export interface ReadyReactivePromise<T> extends BaseReactivePromise<T> {
  value: T;
  isReady: true;
}

export type ReactivePromise<T> = PendingReactivePromise<T> | ReadyReactivePromise<T>;

export type ReactiveTask<T, Args extends unknown[]> = Omit<ReactivePromise<T>, 'notify'> & {
  run(...args: Args): ReactivePromise<T>;
};

export type ReactiveSubscription<T> = Omit<ReactivePromise<T>, 'rerun'>;

export type ReactiveValue<T> =
  // We have to first check if T is a ReactiveTask, because it will also match Promise<T>
  T extends ReactiveTask<infer U, infer Args>
    ? ReactiveTask<U, Args>
    : T extends Promise<infer U>
      ? ReactivePromise<U>
      : T extends Generator<any, infer U>
        ? ReactivePromise<U>
        : T;

// This type is used when initial values are provided to async functions and
// subscriptions. It allows us to skip checking `isReady` when there is always
// a guaranteed value to return.
export type ReadyReactiveValue<T> =
  T extends ReactiveTask<infer U, infer Args>
    ? ReactiveTask<U, Args>
    : T extends Promise<infer U>
      ? ReadyReactivePromise<U>
      : T extends Generator<any, infer U>
        ? ReadyReactivePromise<U>
        : T;
