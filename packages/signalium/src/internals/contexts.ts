import { getFrameworkScope } from '../config.js';
import { SignalOptionsWithInit } from '../types.js';
import { DerivedSignal, DerivedSignalDefinition, createDerivedSignal } from './derived.js';
import { CURRENT_CONSUMER } from './get.js';
import { hashReactiveFn, hashValue } from './utils/hash.js';
import { scheduleGcSweep } from './scheduling.js';

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
    this.contexts = Object.create(parent?.contexts || null);

    this.setContexts(contexts);
  }

  private contexts: Record<symbol, unknown>;
  private children = new Map<number, SignalScope>();
  private signals = new Map<number, DerivedSignal<any, any>>();
  private gcCandidates = new Set<DerivedSignal<any, any>>();

  setContexts(contexts: [ContextImpl<unknown>, unknown][]) {
    for (const [context, value] of contexts) {
      this.contexts[context._key] = value;
    }

    this.signals.clear();
  }

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
    def: DerivedSignalDefinition<T, Args>,
    args: Args,
    opts?: Partial<SignalOptionsWithInit<T, Args>>,
  ): DerivedSignal<T, Args> {
    const paramKey = opts?.paramKey?.(...args);
    const key = hashReactiveFn(def.compute, paramKey ? [paramKey] : args);
    let signal = this.signals.get(key) as DerivedSignal<T, Args> | undefined;

    if (signal === undefined) {
      signal = createDerivedSignal(def, args, key, this, opts);
      this.signals.set(key, signal);
    }

    return signal;
  }

  markForGc(signal: DerivedSignal<any, any>) {
    if (!this.gcCandidates.has(signal)) {
      this.gcCandidates.add(signal);
      scheduleGcSweep(this);
    }
  }

  removeFromGc(signal: DerivedSignal<any, any>) {
    this.gcCandidates.delete(signal);
  }

  forceGc(signal: DerivedSignal<any, any>) {
    this.signals.delete(signal.key!);
  }

  sweepGc() {
    for (const signal of this.gcCandidates) {
      if (signal.watchCount === 0) {
        const { shouldGC } = signal.def;

        if (!shouldGC || shouldGC(signal, signal.value, signal.args)) {
          this.signals.delete(signal.key!);
        }
      }
    }

    this.gcCandidates = new Set();
  }
}

export let ROOT_SCOPE = new SignalScope([]);

export function setRootContexts<C extends unknown[], U>(contexts: [...ContextPair<C>]): void {
  ROOT_SCOPE.setContexts(contexts as [ContextImpl<unknown>, unknown][]);
}

export const clearRootContexts = () => {
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

export function forceGc(_signal: object) {
  const signal = _signal as DerivedSignal<any, any>;
  signal.scope?.forceGc(signal);
}
