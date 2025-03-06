import { TRACER, TracerEventType } from '../trace.js';
import { SubscriptionState } from '../types.js';
import { ComputedSignal, SubscriptionComputedSignal } from './base.js';
import { incrementStateClock } from './clock.js';
import { dirtySignalConsumers } from './dirty.js';

export const createSubscriptionState = <T>(signal: ComputedSignal<T, any[]>): SubscriptionState<T> => ({
  get: () => signal.currentValue as T,
  set: value => {
    if (signal.equals(value, signal.currentValue as T)) {
      return;
    }

    TRACER?.emit({
      type: TracerEventType.StartUpdate,
      id: signal.id,
    });

    signal.currentValue = value;
    signal.updatedAt = incrementStateClock();
    dirtySignalConsumers(signal);

    TRACER?.emit({
      type: TracerEventType.EndUpdate,
      id: signal.id,
      value: signal.currentValue,
      preserveChildren: true,
    });
  },
});

export const runSubscription = <T, Args extends unknown[]>(
  signal: SubscriptionComputedSignal<T, Args>,
  shouldConnect: boolean,
) => {
  if (shouldConnect) {
    signal.state = signal.compute(...signal.args);
  } else {
    const subscription = signal.state;

    if (typeof subscription === 'function') {
      subscription();
      signal.state = signal.compute(...signal.args);
    } else if (subscription !== undefined) {
      subscription.update?.();
    }
  }
};
