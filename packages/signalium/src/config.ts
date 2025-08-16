import { SignalScope } from './internals/contexts.js';

export type FlushCallback = () => void;

export type FlushFn = (fn: FlushCallback) => void;
export type BatchFn = (fn: () => void) => void;

interface SignalHooksConfig {
  scheduleFlush: FlushFn;
  runBatch: BatchFn;
  getFrameworkScope: () => SignalScope | undefined;
}

export let scheduleFlush: FlushFn = flushWatchers => {
  setTimeout(() => {
    flushWatchers();
  }, 0);
};

export let runBatch: BatchFn = fn => fn();

export let getFrameworkScope: () => SignalScope | undefined = () => undefined;

export function setConfig(cfg: Partial<SignalHooksConfig>) {
  scheduleFlush = cfg.scheduleFlush ?? scheduleFlush;
  runBatch = cfg.runBatch ?? runBatch;
  getFrameworkScope = cfg.getFrameworkScope ?? getFrameworkScope;
}
