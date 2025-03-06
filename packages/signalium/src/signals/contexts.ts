import { getFrameworkScope } from '../config.js';
import { SignalOptionsWithInit } from '../types.js';
import { hashValue } from '../utils.js';
import { ComputedSignal, createComputedSignal, SignalId, SignalType } from './base.js';
import { CURRENT_CONSUMER } from './consumer.js';
import { getSignal } from './get.js';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export const FN_CONTEXT_MASKS = new Map<Function, bigint>();

declare const CONTEXT_KEY: unique symbol;

export type Context<T> = {
  [CONTEXT_KEY]: T;
};

let CONTEXT_MASKS_COUNT = 0;

export const createContext = <T>(initialValue: T, description?: string): Context<T> => {
  return new ContextImpl(initialValue, description) as unknown as Context<T>;
};

export class SignalScope {
  constructor(
    contexts: [ContextImpl<unknown>, unknown][],
    private parent?: SignalScope,
  ) {
    this.contexts = Object.create(parent?.contexts || null);

    for (const [context, value] of contexts) {
      this.contexts[context._key] = value;
      this.contextMask |= context._mask;
    }
  }

  private contexts: Record<symbol, unknown>;
  private children = new Map<number, WeakRef<SignalScope>>();
  private contextMask = 0n;
  private signals = new Map<number, WeakRef<ComputedSignal<unknown, unknown[]>>>();

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

    const value = this.contexts[context._key];

    const currentConsumer = CURRENT_CONSUMER;

    if (currentConsumer !== undefined) {
      currentConsumer.contextMask |= context._mask;
    }

    return value as T | undefined;
  }

  private getSignal(key: SignalId, computedMask: bigint): ComputedSignal<unknown, unknown[]> | undefined {
    return (this.contextMask & computedMask) === 0n && this.parent
      ? this.parent.getSignal(key, computedMask)
      : (this.signals.get(key)?.deref() as ComputedSignal<unknown, unknown[]> | undefined);
  }

  setSignal(signal: ComputedSignal<any, any[]>, mask: bigint, isPromoting: boolean) {
    if ((this.contextMask & mask) === 0n && this.parent) {
      this.parent.setSignal(signal, mask, isPromoting);
    } else {
      this.signals.set(signal.id, new WeakRef(signal));

      if (isPromoting) {
        this.parent?.deleteSignal(signal.id);
      }
    }
  }

  private deleteSignal(id: SignalId) {
    this.signals.delete(id);
    this.parent?.deleteSignal(id);
  }

  get(
    type: SignalType,
    fn: (...args: any[]) => any,
    key: SignalId,
    args: unknown[],
    opts?: Partial<SignalOptionsWithInit<unknown, unknown[]>>,
  ): unknown {
    const computedMask = FN_CONTEXT_MASKS.get(fn) ?? 0n;

    let signal = this.getSignal(key, computedMask);

    if (signal === undefined) {
      signal = createComputedSignal(type, key, fn, args, this, opts);
    }

    signal.owner = this;

    return getSignal(signal);
  }
}

export let ROOT_SCOPE = new SignalScope([]);

export const clearRootScope = () => {
  ROOT_SCOPE = new SignalScope([]);
};

let OVERRIDE_SCOPE: SignalScope | undefined;

export const getCurrentScope = (): SignalScope => {
  return OVERRIDE_SCOPE ?? CURRENT_CONSUMER?.owner ?? getFrameworkScope() ?? ROOT_SCOPE;
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
  const scope = OVERRIDE_SCOPE ?? CURRENT_CONSUMER?.owner ?? getFrameworkScope();

  if (scope === undefined) {
    throw new Error(
      'useContext must be used within a signal hook, a withContext, or within a framework-specific context provider.',
    );
  }

  return scope.getContext(context) ?? (context as unknown as ContextImpl<T>)._defaultValue;
};

type ContextPair<T extends unknown[]> = {
  [K in keyof T]: [Context<T[K]>, NoInfer<T[K]>];
};

class ContextImpl<T> {
  _key: symbol;
  _mask: bigint;
  _description: string;

  constructor(
    public readonly _defaultValue: T,
    desc?: string,
  ) {
    const count = CONTEXT_MASKS_COUNT++;
    this._mask = BigInt(1) << BigInt(count);
    this._description = desc ?? `context:${count}`;
    this._key = Symbol(this._description);
  }
}
