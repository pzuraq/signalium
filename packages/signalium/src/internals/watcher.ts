import { scheduleConnect, scheduleDisconnect, scheduleEffect } from './scheduling.js';
import { WatcherListenerOptions } from '../types.js';
import { WatcherSignal } from './base.js';
import { incrementStateClock, STATE_CLOCK } from './clock.js';
import { checkSignal } from './get.js';

export const runWatcher = <T>(signal: WatcherSignal<T>, initialized: boolean, immediate: boolean) => {
  const prevValue = signal.currentValue;
  const nextValue = signal.compute();

  if (!initialized || !signal.equals(prevValue!, nextValue)) {
    signal.currentValue = nextValue;
    signal.updatedAt = STATE_CLOCK;

    if (immediate) {
      runEffects(signal);
    } else {
      scheduleEffect(signal);
    }
  }
};

export function runEffects<T>(signal: WatcherSignal<T>) {
  const currentValue = signal.currentValue!;

  for (const subscriber of signal.state) {
    subscriber(currentValue);
  }
}

export function addListener<T>(
  signal: WatcherSignal<T>,
  subscriber: (value: T) => void,
  opts?: WatcherListenerOptions,
) {
  const subscribers = signal.state!;
  const index = subscribers.indexOf(subscriber);

  if (index === -1) {
    subscribers.push(subscriber);

    if (opts?.immediate) {
      checkSignal(signal, true, 1, true);
    } else {
      incrementStateClock();
      scheduleConnect(signal);
    }
  }

  return () => {
    const index = subscribers.indexOf(subscriber);

    if (index !== -1) {
      subscribers.splice(index, 1);
      scheduleDisconnect(signal);
    }
  };
}
