import {
  createComputed,
  createAsyncComputed,
  createSubscription,
  getCurrentConsumer,
  type AsyncReady,
  type AsyncResult,
  type Signal,
  type SignalOptions,
  type SignalOptionsWithInit,
  SignalSubscription,
  createWatcher,
  Watcher,
  ComputedSignal,
} from './signals.js';
import { hashValue } from './utils.js';
import { getFrameworkScope, useSignalValue } from './config.js';
import { WeakRef } from '@signalium/utils';

declare const CONTEXT_KEY: unique symbol;

export type Context<T> = symbol & {
  [CONTEXT_KEY]: T;
};

const CONTEXT_DEFAULT_VALUES = new Map<Context<unknown>, unknown>();
const CONTEXT_MASKS = new Map<Context<unknown>, bigint>();

let CONTEXT_MASKS_COUNT = 0;

const COMPUTED_CONTEXT_MASKS = new Map<object, bigint>();
const COMPUTED_OWNERS = new WeakMap<ComputedSignal<unknown>, SignalScope>();

let CURRENT_MASK: bigint | null = null;

export const createContext = <T>(initialValue: T, description?: string) => {
  const count = CONTEXT_MASKS_COUNT++;
  const key = Symbol(description ?? `context:${count}`) as Context<T>;

  CONTEXT_DEFAULT_VALUES.set(key, initialValue);
  CONTEXT_MASKS.set(key, BigInt(1) << BigInt(count));

  return key;
};

export type SignalStoreMap = {
  [K in Context<unknown>]: K extends Context<infer T> ? T : never;
};

export class SignalScope {
  constructor(
    contexts: SignalStoreMap,
    private parent?: SignalScope,
  ) {
    this.contexts = Object.create(parent?.contexts || null);

    for (const key of Object.getOwnPropertySymbols(contexts)) {
      this.contexts[key as Context<unknown>] = contexts[key as Context<unknown>];
      this.contextMask |= CONTEXT_MASKS.get(key as Context<unknown>)!;
    }
  }

  private contexts: SignalStoreMap;
  private children = new Map<string, SignalScope>();
  private contextMask = 0n;
  private signals = new Map<string, WeakRef<Signal<unknown>>>();

  getChild(contexts: SignalStoreMap) {
    const key = hashValue(contexts);

    let child = this.children.get(key);

    if (child === undefined) {
      child = new SignalScope(contexts, this);
      this.children.set(key, child);
    }

    return child;
  }

  getContext<T>(context: Context<T>): T | undefined {
    const value = this.contexts[context];

    if (CURRENT_MASK !== null) {
      CURRENT_MASK |= CONTEXT_MASKS.get(context)!;
    }

    return value as T | undefined;
  }

  private getSignal(key: string, computedMask: bigint): Signal<unknown> | undefined {
    return (this.contextMask & computedMask) === 0n && this.parent
      ? this.parent.getSignal(key, computedMask)
      : this.signals.get(key)?.deref();
  }

  private setSignal(key: string, signal: Signal<unknown>, mask: bigint, isPromoting: boolean) {
    if ((this.contextMask & mask) === 0n && this.parent) {
      this.parent.setSignal(key, signal, mask, isPromoting);
    } else {
      this.signals.set(key, new WeakRef(signal));

      if (isPromoting) {
        this.parent?.deleteSignal(key);
      }
    }
  }

  private deleteSignal(key: string) {
    this.signals.delete(key);
    this.parent?.deleteSignal(key);
  }

  run(fn: (...args: any[]) => any, args: any[], key: string, signal: Signal<unknown>, initialized: boolean) {
    const prevMask = CURRENT_MASK;
    const fnMask = COMPUTED_CONTEXT_MASKS.get(fn) ?? 0n;
    const signalMask = COMPUTED_CONTEXT_MASKS.get(signal) ?? 0n;

    try {
      CURRENT_MASK = signalMask | fnMask;

      return fn(...args);
    } finally {
      if (!initialized || signalMask !== CURRENT_MASK) {
        COMPUTED_CONTEXT_MASKS.set(fn, CURRENT_MASK!);
        COMPUTED_CONTEXT_MASKS.set(signal, CURRENT_MASK!);
        getCurrentScope().setSignal(key, signal!, CURRENT_MASK!, initialized);
        initialized = true;
      }

      CURRENT_MASK = prevMask;
    }
  }

  get(
    makeSignal: (fn: (...args: any[]) => any, opts?: Partial<SignalOptionsWithInit<unknown>>) => Signal<unknown>,
    fn: (...args: any[]) => any,
    args: unknown[],
    opts?: Partial<SignalOptionsWithInit<unknown>>,
  ): unknown {
    const computedMask = COMPUTED_CONTEXT_MASKS.get(fn) ?? 0n;
    const key = hashValue([fn, args]);

    let signal = this.getSignal(key, computedMask);

    // console.log('get', key, computedMask);

    if (signal === undefined) {
      let initialized = false;

      if (makeSignal === createSubscription) {
        signal = makeSignal((get, set) => {
          const sub = this.run(fn, [{ get, set }, ...args], key, signal!, initialized) as
            | SignalSubscription
            | undefined;

          if (sub?.update) {
            const originalUpdate = sub.update;

            sub.update = (...args) => {
              return this.run(originalUpdate, [], key, signal!, initialized);
            };
          }

          initialized = true;

          return sub;
        }, opts);
      } else {
        signal = makeSignal(() => {
          const result = this.run(fn, args, key, signal!, initialized);

          initialized = true;

          return result;
        }, opts);
      }
    }

    COMPUTED_OWNERS.set(signal as ComputedSignal<unknown>, this);

    const value = signal.get();

    if (CURRENT_MASK !== null) {
      CURRENT_MASK |= COMPUTED_CONTEXT_MASKS.get(fn) ?? 0n;
    }

    return value;
  }
}

export let ROOT_SCOPE = new SignalScope({});

export const clearRootScope = () => {
  ROOT_SCOPE = new SignalScope({});
};

let OVERRIDE_SCOPE: SignalScope | undefined;

const getCurrentScope = (): SignalScope => {
  if (OVERRIDE_SCOPE !== undefined) {
    return OVERRIDE_SCOPE;
  }

  const currentConsumer = getCurrentConsumer();

  if (currentConsumer) {
    const scope = COMPUTED_OWNERS.get(currentConsumer);

    return scope ?? ROOT_SCOPE;
  }

  return getFrameworkScope() ?? ROOT_SCOPE;
};

export const withContext = <T>(contexts: SignalStoreMap, fn: () => T): T => {
  const prevScope = OVERRIDE_SCOPE;
  const currentScope = getCurrentScope();

  try {
    OVERRIDE_SCOPE = currentScope.getChild(contexts);
    return fn();
  } finally {
    OVERRIDE_SCOPE = prevScope;
  }
};

export const useContext = <T>(context: Context<T>): T => {
  let scope = OVERRIDE_SCOPE;

  if (scope === undefined) {
    const currentConsumer = getCurrentConsumer();
    scope = currentConsumer ? COMPUTED_OWNERS.get(currentConsumer) : undefined;
  }

  if (scope === undefined) {
    throw new Error(
      'useContext must be used within a signal hook or withContext. If you are using a standard signal, use createComputed, createAsyncComputed, or createSubscription to create a signal hook instead.',
    );
  }

  return scope.getContext(context) ?? (CONTEXT_DEFAULT_VALUES.get(context) as T);
};

export function computed<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts?: SignalOptions<T>,
): (...args: Args) => T {
  return (...args) => {
    return useSignalValue(() => {
      const scope = getCurrentScope();
      return scope.get(createComputed, fn, args, opts as Partial<SignalOptionsWithInit<unknown>>) as T;
    });
  };
}

export type AsyncAwaitableResult<T> = T | Promise<T>;

export function asyncComputed<T, Args extends unknown[]>(
  fn: (...args: Args) => T | Promise<T>,
  opts?: SignalOptions<T>,
): (...args: Args) => AsyncResult<T>;
export function asyncComputed<T, Args extends unknown[]>(
  fn: (...args: Args) => T | Promise<T>,
  opts: SignalOptionsWithInit<T>,
): (...args: Args) => AsyncReady<T>;
export function asyncComputed<T, Args extends unknown[]>(
  fn: (...args: Args) => T | Promise<T>,
  opts?: Partial<SignalOptionsWithInit<T>>,
): (...args: Args) => AsyncResult<T> | AsyncReady<T> {
  return (...args) => {
    return useSignalValue(() => {
      const scope = getCurrentScope();
      return scope.get(
        createAsyncComputed,
        fn,
        args,
        opts as Partial<SignalOptionsWithInit<unknown>>,
      ) as AsyncResult<T>;
    });
  };
}

export interface SubscriptionState<T> {
  get: () => T;
  set: (value: T) => void;
}

export type SignalSubscribe<T, Args extends unknown[]> = (
  state: SubscriptionState<T>,
  ...args: Args
) => SignalSubscription | (() => void) | undefined | void;

export function subscription<T, Args extends unknown[]>(
  fn: SignalSubscribe<T, Args>,
  opts?: Partial<SignalOptionsWithInit<T>>,
): (...args: Args) => T {
  const wrapper = (state: SubscriptionState<T>, ...args: Args) => {
    let result = fn(state, ...args);

    if (typeof result === 'function') {
      return {
        update() {
          (result as () => void)();
          result = fn(state, ...args);
        },

        unsubscribe() {
          (result as () => void)();
        },
      };
    }

    return result;
  };
  return (...args) => {
    return useSignalValue(() => {
      const scope = getCurrentScope();
      return scope.get(createSubscription, wrapper, args, opts as Partial<SignalOptionsWithInit<unknown>>) as T;
    });
  };
}

export function watcher<T>(fn: (prev: T | undefined) => T, opts?: SignalOptions<T>): Watcher<T> {
  const scope = getFrameworkScope() ?? ROOT_SCOPE;

  const w = createWatcher(fn, opts);

  COMPUTED_OWNERS.set(w as ComputedSignal<unknown>, scope);

  return w;
}
