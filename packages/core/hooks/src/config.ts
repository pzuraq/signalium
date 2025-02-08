import { getCurrentConsumer } from 'signalium';
import { SignalContextScope } from './context.js';

interface SignalHooksConfig {
  getCurrentScope: () => SignalContextScope | undefined;
  useSignalValue: <T>(fn: () => T) => T;
}

let config: SignalHooksConfig = {
  getCurrentScope: () => undefined,
  useSignalValue: fn => fn(),
};

export function getFrameworkScope(): SignalContextScope | undefined {
  return config.getCurrentScope();
}

export function useSignalValue<T>(fn: () => T): T {
  if (getCurrentConsumer()) {
    return fn();
  } else {
    return config.useSignalValue(fn);
  }
}
