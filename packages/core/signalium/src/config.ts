import { SignalScope } from './hooks.js';
import { getCurrentConsumer } from './signals.js';

let currentFlush: ReturnType<typeof setTimeout> | null = null;

export type FlushCallback = () => Promise<void>;

export type FlushFn = (fn: FlushCallback) => void;
export type BatchFn = (fn: () => void) => void;

interface SignalHooksConfig {
  scheduleFlush: FlushFn;
  runBatch: BatchFn;
  getFrameworkScope: () => SignalScope | undefined;
  useSignalValue: <T>(fn: () => T) => T;
}

export let scheduleFlush: FlushFn = flushWatchers => {
  if (currentFlush !== null) return;

  currentFlush = setTimeout(() => {
    currentFlush = null;

    flushWatchers();
  }, 0);
};

export let runBatch: BatchFn = fn => fn();

export let getFrameworkScope: () => SignalScope | undefined = () => undefined;

let useFrameworkSignalValue: <T>(fn: () => T) => T = fn => fn();

export function useSignalValue<T>(fn: () => T): T {
  if (getCurrentConsumer()) {
    return fn();
  } else {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useFrameworkSignalValue(fn);
  }
}

export function setConfig(cfg: Partial<SignalHooksConfig>) {
  scheduleFlush = cfg.scheduleFlush ?? scheduleFlush;
  runBatch = cfg.runBatch ?? runBatch;
  getFrameworkScope = cfg.getFrameworkScope ?? getFrameworkScope;
  useFrameworkSignalValue = cfg.useSignalValue ?? useFrameworkSignalValue;
}
