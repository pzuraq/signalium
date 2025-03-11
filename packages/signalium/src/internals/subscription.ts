import { state } from '../hooks.js';
import { TRACER, TracerEventType } from '../trace.js';
import { SubscriptionState } from '../types.js';
import { DerivedSignal, SubscriptionSignal } from './base.js';
import { incrementStateClock } from './clock.js';
import { dirtySignalConsumers } from './dirty.js';
import { createStateSignal, StateSignal } from './state.js';

export class Subscription<T> {
  private _value: StateSignal<T | undefined>;
  private _ready: StateSignal<boolean>;

  constructor(
    private _signal: SubscriptionSignal<T, any[]>,
    initValue?: T,
  ) {
    this._value = createStateSignal(initValue);
    this._ready = createStateSignal(!!initValue);
  }

  get value() {
    return this._value.get();
  }

  get isReady() {
    return this._ready.get();
  }
}

export const createSubscriptionState = <T>(signal: SubscriptionSignal<T, any[]>): SubscriptionState<T> => ({
  get: () => signal.currentValue!,
  set: value => {
    if (signal.equals(value, signal.currentValue!)) {
      return;
    }

    TRACER?.emit({
      type: TracerEventType.StartUpdate,
      id: signal.tracerMeta!.id,
    });

    signal.currentValue = value;
    signal.updatedAt = incrementStateClock();
    dirtySignalConsumers(signal);

    TRACER?.emit({
      type: TracerEventType.EndUpdate,
      id: signal.tracerMeta!.id,
      value: signal.currentValue,
      preserveChildren: true,
    });
  },
});

export const runSubscription = <T, Args extends unknown[]>(
  signal: SubscriptionSignal<T, Args>,
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
