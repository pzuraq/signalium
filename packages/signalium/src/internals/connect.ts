import { DerivedSignal, isSubscription } from './derived.js';
import { checkSignal } from './get.js';

export function watchSignal(signal: DerivedSignal<any, any>): void {
  const { watchCount } = signal;
  const newWatchCount = watchCount + 1;

  signal.watchCount = newWatchCount;

  // If > 0, already watching, return
  if (watchCount > 0) return;

  for (const dep of signal.deps.keys()) {
    watchSignal(dep);
  }

  if (isSubscription(signal)) {
    // Bootstrap the subscription
    checkSignal(signal);
  }
}

export function unwatchSignal(signal: DerivedSignal<any, any>, count = 1) {
  const { watchCount } = signal;
  const newWatchCount = Math.max(watchCount - count, 0);

  signal.watchCount = newWatchCount;

  if (newWatchCount > 0) {
    return;
  }

  for (const dep of signal.deps.keys()) {
    unwatchSignal(dep);
  }

  if (isSubscription(signal)) {
    // teardown the subscription
    signal.value?.();
  }
}
