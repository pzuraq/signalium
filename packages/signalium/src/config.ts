import { SignalScope } from './hooks.js';
import { CURRENT_CONSUMER } from './signals/consumer.js';

export type FlushCallback = () => void;

export type FlushFn = (fn: FlushCallback) => void;
export type BatchFn = (fn: () => void) => void;

interface SignalHooksConfig {
  scheduleFlush: FlushFn;
  runBatch: BatchFn;
  getFrameworkScope: () => SignalScope | undefined;
  useSignalValue: <T>(key: string | number, fn: () => T) => T;
}

export let scheduleFlush: FlushFn = flushWatchers => {
  setTimeout(() => {
    flushWatchers();
  }, 0);
};

export let runBatch: BatchFn = fn => fn();

export let getFrameworkScope: () => SignalScope | undefined = () => undefined;

let useFrameworkSignalValue: <T>(key: string | number, fn: () => T) => T = (key, fn) => fn();

export function useSignalValue<T>(key: string | number, fn: () => T): T {
  if (CURRENT_CONSUMER !== undefined) {
    return fn();
  } else {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useFrameworkSignalValue(key, fn);
  }
}

export function setConfig(cfg: Partial<SignalHooksConfig>) {
  scheduleFlush = cfg.scheduleFlush ?? scheduleFlush;
  runBatch = cfg.runBatch ?? runBatch;
  getFrameworkScope = cfg.getFrameworkScope ?? getFrameworkScope;
  useFrameworkSignalValue = cfg.useSignalValue ?? useFrameworkSignalValue;
}
