import { DerivedSignal } from './internals/derived.js';
import { SignalScope } from './internals/contexts.js';
import { ReactiveValue } from './types.js';
import { StateSignal } from './internals/state.js';
import { CURRENT_CONSUMER } from './internals/get.js';

export type FlushCallback = () => void;

export type FlushFn = (fn: FlushCallback) => void;
export type BatchFn = (fn: () => void) => void;

interface SignalHooksConfig {
  scheduleFlush: FlushFn;
  runBatch: BatchFn;
  getFrameworkScope: () => SignalScope | undefined;
  useStateSignal: <T>(signal: StateSignal<T>) => T;
  useDerivedSignal: <T, Args extends unknown[]>(signal: DerivedSignal<T, Args>) => ReactiveValue<T>;
}

export let scheduleFlush: FlushFn = flushWatchers => {
  setTimeout(() => {
    flushWatchers();
  }, 0);
};

export let runBatch: BatchFn = fn => fn();

export let getFrameworkScope: () => SignalScope | undefined = () => undefined;

let useFrameworkStateSignal: <T>(signal: StateSignal<T>) => T = signal => signal.peek();
let useFrameworkDerivedSignal: <T, Args extends unknown[]>(
  signal: DerivedSignal<T, Args>,
) => ReactiveValue<T> = signal => signal.get();

export function useDerivedSignal<T, Args extends unknown[]>(signal: DerivedSignal<T, Args>): ReactiveValue<T> {
  if (CURRENT_CONSUMER !== undefined) {
    return signal.get();
  } else {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useFrameworkDerivedSignal(signal);
  }
}

export function useStateSignal<T>(signal: StateSignal<T>): T {
  return useFrameworkStateSignal(signal);
}

export function setConfig(cfg: Partial<SignalHooksConfig>) {
  scheduleFlush = cfg.scheduleFlush ?? scheduleFlush;
  runBatch = cfg.runBatch ?? runBatch;
  getFrameworkScope = cfg.getFrameworkScope ?? getFrameworkScope;
  useFrameworkStateSignal = cfg.useStateSignal ?? useFrameworkStateSignal;
  useFrameworkDerivedSignal = cfg.useDerivedSignal ?? useFrameworkDerivedSignal;
}
