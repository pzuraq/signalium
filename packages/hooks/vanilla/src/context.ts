import { WriteableSignal } from 'signalium';

export class SignalStore {
  constructor() {}

  private contexts = new Map<object, WriteableSignal<unknown>>();
  private signals = new Map<object, Map<number, Signal>>();

  getContextSignal<T>(context: Context<T>, current: Signal<T> | undefined): WriteableSignal<T> {
    let signal = this.contexts.get(context);

    if (signal && (!current || current !== signal)) {
      throw new Error(
        'Cannot register multiple values on the same context concurrently. Signal contexts must be singletons',
      );
    } else if (!signal) {
      signal = state(undefined);
      this.contexts.set(context, signal);
    }

    return signal as WriteableSignal<T>;
  }

  deleteContext<T>(context: Context<T>) {
    this.contexts.delete(context);
  }

  getContext<T>(context: Context<T>): T {
    const signal = this.contexts.get(context);

    if (!signal) {
      throw new Error('Context not found in SignalStore. Did you use the correct createContext function?');
    }

    return signal.get() as T;
  }

  private _getComputed(
    isAsync: boolean,
    fn: (...args: any[]) => any,
    args: unknown[],
    opts?: Partial<SignalOptionsWithInit<unknown>>,
  ): Signal<unknown> {
    let argsMap = this.signals.get(fn);

    if (!argsMap) {
      argsMap = new Map();
      this.signals.set(fn, argsMap);
    }

    const argsHash = hashIt(args);

    let signal = argsMap.get(argsHash) as Signal<unknown> | undefined;

    if (!signal) {
      const makeComputed = isAsync ? asyncComputed : computed;

      signal = makeComputed(() => {
        const prevStore = CURRENT_SIGNAL_STORE;

        try {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          CURRENT_SIGNAL_STORE = this;
          return fn(...args);
        } finally {
          CURRENT_SIGNAL_STORE = prevStore;
        }
      }, opts);

      argsMap.set(argsHash, signal);
    }

    return signal;
  }

  getComputedFor<T, Args extends unknown[]>(
    fn: (...args: Args) => T,
    args: Args,
    opts?: Partial<SignalOptionsWithInit<T>>,
  ): Signal<T> {
    return this._getComputed(false, fn, args, opts as Partial<SignalOptionsWithInit<unknown>>) as Signal<T>;
  }

  getAsyncComputedFor<T, Args extends unknown[]>(
    fn: (...args: Args) => T | Promise<T>,
    args: Args,
    opts?: Partial<SignalOptionsWithInit<T>>,
  ): AsyncSignal<T> {
    return this._getComputed(true, fn, args, opts as Partial<SignalOptionsWithInit<unknown>>) as AsyncSignal<T>;
  }
}
