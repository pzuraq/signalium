import {
  SignalSubscribe,
  computed,
  asyncComputed,
  subscription,
  getCurrentConsumer,
  type AsyncReady,
  type AsyncResult,
  type Signal,
  type SignalOptions,
  type SignalOptionsWithInit,
} from 'signalium';

declare const CONTEXT_KEY: unique symbol;

export type Context<T> = symbol & {
  [CONTEXT_KEY]: T;
};

const CONTEXT_DEFAULT_VALUES = new Map<Context<unknown>, unknown>();
const CONTEXT_MASKS = new Map<Context<unknown>, bigint>();

let CONTEXT_MASKS_COUNT = 0;

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
const COMPUTED_CONTEXT_MASKS = new Map<Function, bigint>();
const COMPUTED_OWNERS = new WeakMap<Signal<unknown>, SignalContextScope>();

let CURRENT_MASK: bigint | null = null;

export const createContext = <T>(initialValue: T, description?: string) => {
  const key = Symbol(description) as Context<T>;

  CONTEXT_DEFAULT_VALUES.set(key, initialValue);
  CONTEXT_MASKS.set(key, BigInt(1) << BigInt(CONTEXT_MASKS_COUNT++));

  return key;
};

export type SignalStoreMap = {
  [K in Context<unknown>]: K extends Context<infer T> ? T : never;
};

const objectToIdMap = new WeakMap<object, string>();
let nextId = 1;

function getObjectId(obj: object): string {
  let id = objectToIdMap.get(obj);
  if (id === undefined) {
    id = String(nextId++);
    objectToIdMap.set(obj, id);
  }
  return id;
}

// Handle basic POJOs and arrays recursively
function isPOJO(obj: object): boolean {
  return Object.getPrototypeOf(obj) === Object.prototype;
}

function isPlainArray(arr: unknown): arr is unknown[] {
  return Array.isArray(arr);
}

function hashValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  switch (typeof value) {
    case 'number':
    case 'boolean':
    case 'string':
      return String(value);
    case 'bigint':
      return value.toString();
    case 'symbol':
      return String(value);
    case 'object': {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (isPlainArray(value)) {
        return `[${value.map(hashValue).join(',')}]`;
      }
      if (isPOJO(value)) {
        const entries = [
          ...Object.entries(value),
          ...Object.getOwnPropertySymbols(value).map(sym => [sym, value[sym as keyof typeof value]]),
        ].sort(([a], [b]) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));

        return `{${entries.map(([k, v]) => `${String(k)}:${hashValue(v)}`).join(',')}}`;
      }
      return getObjectId(value);
    }
    case 'function':
      return getObjectId(value);
    default:
      return getObjectId(value as object);
  }
}

class SignalContextScope {
  constructor(
    contexts: SignalStoreMap,
    private parent?: SignalContextScope,
  ) {
    this.contexts = Object.create(parent?.contexts || null);

    for (const key of Object.getOwnPropertySymbols(contexts)) {
      this.contexts[key as Context<unknown>] = contexts[key as Context<unknown>];
      this.contextMask |= CONTEXT_MASKS.get(key as Context<unknown>)!;
    }
  }

  private contexts: SignalStoreMap;
  private children = new Map<string, SignalContextScope>();
  private contextMask = 0n;
  private signals = new Map<string, Signal<unknown>>();

  getChild(contexts: SignalStoreMap) {
    const key = hashValue(contexts);

    let child = this.children.get(key);

    if (child === undefined) {
      child = new SignalContextScope(contexts, this);
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
      : this.signals.get(key);
  }

  private setSignal(key: string, signal: Signal<unknown>, mask: bigint) {
    if ((this.contextMask & mask) === 0n && this.parent) {
      this.parent.setSignal(key, signal, mask);
    } else {
      this.signals.set(key, signal);
      this.parent?.deleteSignal(key);
    }
  }

  private deleteSignal(key: string) {
    this.signals.delete(key);
    this.parent?.deleteSignal(key);
  }

  private get(
    makeSignal: (fn: (...args: any[]) => any, opts?: Partial<SignalOptionsWithInit<unknown>>) => Signal<unknown>,
    fn: (...args: any[]) => any,
    args: unknown[],
    opts?: Partial<SignalOptionsWithInit<unknown>>,
  ): unknown {
    const computedMask = COMPUTED_CONTEXT_MASKS.get(fn) ?? 0n;
    const key = hashValue([fn, args]);

    let signal = this.getSignal(key, computedMask);

    if (signal === undefined) {
      let initialized = false;

      signal = makeSignal(() => {
        const prevMask = CURRENT_MASK;

        try {
          CURRENT_MASK = COMPUTED_CONTEXT_MASKS.get(fn) ?? 0n;

          return fn(...args);
        } finally {
          const computedMask = COMPUTED_CONTEXT_MASKS.get(fn);

          if (!initialized || computedMask !== CURRENT_MASK) {
            initialized = true;
            COMPUTED_CONTEXT_MASKS.set(fn, CURRENT_MASK!);
            getCurrentScope().setSignal(key, signal!, CURRENT_MASK!);
          }

          CURRENT_MASK = prevMask;
        }
      }, opts);
    }

    COMPUTED_OWNERS.set(signal, this);

    const value = signal.get();

    if (CURRENT_MASK !== null) {
      CURRENT_MASK |= COMPUTED_CONTEXT_MASKS.get(fn) ?? 0n;
    }

    return value;
  }

  getComputedFor<T, Args extends unknown[]>(
    fn: (...args: Args) => T,
    args: Args,
    opts?: Partial<SignalOptionsWithInit<T>>,
  ): T {
    return this.get(computed, fn, args, opts as Partial<SignalOptionsWithInit<unknown>>) as T;
  }

  getAsyncComputedFor<T, Args extends unknown[]>(
    fn: (...args: Args) => T | Promise<T>,
    args: Args,
    opts?: Partial<SignalOptionsWithInit<T>>,
  ): AsyncResult<T> {
    return this.get(asyncComputed, fn, args, opts as Partial<SignalOptionsWithInit<unknown>>) as AsyncResult<T>;
  }

  getSubscriptionFor<T, Args extends unknown[]>(
    fn: SignalSubscribe<T>,
    args: Args,
    opts?: Partial<SignalOptionsWithInit<T>>,
  ): T {
    return this.get(subscription, fn, args, opts as Partial<SignalOptionsWithInit<unknown>>) as T;
  }
}

export const ROOT_SCOPE = new SignalContextScope({});

let OVERRIDE_SCOPE: SignalContextScope | undefined;

const getCurrentScope = (): SignalContextScope => {
  if (OVERRIDE_SCOPE !== undefined) {
    return OVERRIDE_SCOPE;
  }

  const currentConsumer = getCurrentConsumer();

  let currentScope;

  if (currentConsumer) {
    currentScope = COMPUTED_OWNERS.get(currentConsumer);
  }

  return currentScope ?? ROOT_SCOPE;
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

export function createComputed<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  opts?: { initValue?: T },
): (...args: Args) => T {
  return (...args) => {
    const scope = getCurrentScope();
    return scope.getComputedFor(fn, args, opts);
  };
}

export type AsyncAwaitableResult<T> = T | Promise<T>;

export function createAsyncComputed<T, Args extends unknown[]>(
  fn: (...args: Args) => T | Promise<T>,
  opts?: SignalOptions<T>,
): (...args: Args) => AsyncResult<T>;
export function createAsyncComputed<T, Args extends unknown[]>(
  fn: (...args: Args) => T | Promise<T>,
  opts: SignalOptionsWithInit<T>,
): (...args: Args) => AsyncReady<T>;
export function createAsyncComputed<T, Args extends unknown[]>(
  fn: (...args: Args) => T | Promise<T>,
  opts?: Partial<SignalOptionsWithInit<T>>,
): (...args: Args) => AsyncResult<T> | AsyncReady<T> {
  return (...args) => {
    const scope = getCurrentScope();
    return scope.getAsyncComputedFor(fn, args, opts);
  };
}

export function createSubscription<T, Args extends unknown[]>(
  fn: SignalSubscribe<T>,
  opts?: Partial<SignalOptionsWithInit<T>>,
): (...args: Args) => T {
  return (...args) => {
    const scope = getCurrentScope();
    return scope.getSubscriptionFor(fn, args, opts);
  };
}
