import { getFrameworkScope } from '../config.js';
import { SignalOptionsWithInit } from '../types.js';
import { hashValue } from './utils.js';
import { DerivedSignal, createDerivedSignal, SignalId, SignalType, DerivedSignalType } from './base.js';
import { CURRENT_CONSUMER } from './consumer.js';
import { getValue } from './get.js';

declare const CONTEXT_KEY: unique symbol;

export type Context<T> = {
  [CONTEXT_KEY]: T;
};

type ContextPair<T extends unknown[]> = {
  [K in keyof T]: [Context<T[K]>, NoInfer<T[K]>];
};

let CONTEXT_ID = 0;

class ContextImpl<T> {
  _key: symbol;
  _description: string;

  constructor(
    public readonly _defaultValue: T,
    desc?: string,
  ) {
    this._description = desc ?? `context:${CONTEXT_ID++}`;
    this._key = Symbol(this._description);
  }
}

export const createContext = <T>(initialValue: T, description?: string): Context<T> => {
  return new ContextImpl(initialValue, description) as unknown as Context<T>;
};

export class SignalScope {
  constructor(contexts: [ContextImpl<unknown>, unknown][], parent?: SignalScope) {
    this.contexts = Object.create(parent?.contexts || null);

    for (const [context, value] of contexts) {
      this.contexts[context._key] = value;
    }
  }

  private contexts: Record<symbol, unknown>;
  private children = new Map<number, WeakRef<SignalScope>>();
  private signals = new Map<number, WeakRef<DerivedSignal<unknown, unknown[]>>>();

  getChild(contexts: [ContextImpl<unknown>, unknown][]) {
    const key = hashValue(contexts);

    let child = this.children.get(key)?.deref();

    if (child === undefined) {
      child = new SignalScope(contexts, this);
      this.children.set(key, new WeakRef(child));
    }

    return child;
  }

  getContext<T>(_context: Context<T>): T | undefined {
    const context = _context as unknown as ContextImpl<T>;

    return this.contexts[context._key] as T | undefined;
  }

  get(
    type: DerivedSignalType,
    fn: (...args: any[]) => any,
    key: SignalId,
    args: unknown[],
    opts?: Partial<SignalOptionsWithInit<unknown, unknown[]>>,
  ): unknown {
    let signal = this.signals.get(key)?.deref();

    if (signal === undefined) {
      signal = createDerivedSignal(type, fn, args, key, this, opts);
      this.signals.set(key, new WeakRef(signal));
    }

    return getValue(signal);
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

export const useContext = <T>(context: Context<T>): T => {
  const scope = OVERRIDE_SCOPE ?? CURRENT_CONSUMER?.scope ?? getFrameworkScope();

  if (scope === undefined) {
    throw new Error(
      'useContext must be used within a signal hook, a withContext, or within a framework-specific context provider.',
    );
  }

  return scope.getContext(context) ?? (context as unknown as ContextImpl<T>)._defaultValue;
};
