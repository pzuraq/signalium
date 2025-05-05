import { getFrameworkScope } from '../config.js';
import { SignalOptionsWithInit } from '../types.js';
import { DerivedSignal, createDerivedSignal } from './derived.js';
import { CURRENT_CONSUMER } from './get.js';
import { hashReactiveFn, hashValue } from './utils/hash.js';

export const CONTEXT_KEY = Symbol('signalium:context');

export type Context<T> = {
  defaultValue: T;
};

export type ContextPair<T extends unknown[]> = {
  [K in keyof T]: [Context<T[K]>, NoInfer<T[K]>];
};

let CONTEXT_ID = 0;

export class ContextImpl<T> {
  _key: symbol;
  _description: string;

  constructor(
    public readonly defaultValue: T,
    desc?: string,
  ) {
    this._description = desc ?? `context:${CONTEXT_ID++}`;
    this._key = Symbol(this._description);
  }
}

export const createContext = <T>(initialValue: T, description?: string): Context<T> => {
  return new ContextImpl(initialValue, description);
};

export class SignalScope {
  constructor(contexts: [ContextImpl<unknown>, unknown][], parent?: SignalScope) {
    this.parentScope = parent;
    this.contexts = Object.create(parent?.contexts || null);

    for (const [context, value] of contexts) {
      this.contexts[context._key] = value;
    }
  }

  private parentScope?: SignalScope = undefined;
  private contexts: Record<symbol, unknown>;
  private children = new Map<number, SignalScope>();
  private signals = new Map<number, DerivedSignal<any, any[]>>();

  getChild(contexts: [ContextImpl<unknown>, unknown][]) {
    const key = hashValue(contexts);

    let child = this.children.get(key);

    if (child === undefined) {
      child = new SignalScope(contexts, this);
      this.children.set(key, child);
    }

    return child;
  }

  getContext<T>(_context: Context<T>): T | undefined {
    const context = _context as unknown as ContextImpl<T>;

    return this.contexts[context._key] as T | undefined;
  }

  get<T, Args extends unknown[]>(
    fn: (...args: Args) => T,
    args: Args,
    opts?: Partial<SignalOptionsWithInit<T, Args>>,
  ): DerivedSignal<T, Args> {
    const paramKey = opts?.paramKey?.(...args);
    const key = hashReactiveFn(fn, paramKey ? [paramKey] : args);
    let signal = this.signals.get(key) as DerivedSignal<T, Args> | undefined;

    if (signal === undefined) {
      signal = createDerivedSignal(fn, args, key, this, opts);
      this.signals.set(key, signal);
    }

    return signal;
  }
}

export let ROOT_SCOPE = new SignalScope([]);

export const clearRootScope = () => {
  ROOT_SCOPE = new SignalScope([]);
};

let OVERRIDE_SCOPE: SignalScope | undefined;

export const getCurrentScope = (): SignalScope => {
  return OVERRIDE_SCOPE ?? CURRENT_CONSUMER?.scope ?? getFrameworkScope() ?? ROOT_SCOPE;
};

export function withContexts<C extends unknown[], U>(contexts: [...ContextPair<C>], fn: () => U): U {
  const prevScope = OVERRIDE_SCOPE;
  const currentScope = getCurrentScope();

  try {
    OVERRIDE_SCOPE = currentScope.getChild(contexts as [ContextImpl<unknown>, unknown][]);
    return fn();
  } finally {
    OVERRIDE_SCOPE = prevScope;
  }
}

export const withScope = <T>(scope: SignalScope, fn: () => T) => {
  const prevScope = OVERRIDE_SCOPE;

  try {
    OVERRIDE_SCOPE = scope;
    return fn();
  } finally {
    OVERRIDE_SCOPE = prevScope;
  }
};

export const useContext = <T>(context: Context<T>): T => {
  const scope = OVERRIDE_SCOPE ?? CURRENT_CONSUMER?.scope ?? getFrameworkScope();

  if (scope === undefined) {
    throw new Error(
      'useContext must be used within a signal hook, a withContext, or within a framework-specific context provider.',
    );
  }

  return scope.getContext(context) ?? (context as unknown as ContextImpl<T>).defaultValue;
};
