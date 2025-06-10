/* eslint-disable react-hooks/rules-of-hooks */
import { useCallback, useSyncExternalStore } from 'react';
import type { DerivedSignal } from '../internals/derived.js';
import type { StateSignal } from '../internals/state.js';
import type { ReactiveValue } from '../types.js';
import { isReactivePromise } from '../internals/utils/type-utils.js';
import { isReactiveSubscription } from '../internals/async.js';
import { isRendering } from './rendering.js';

export function useStateSignal<T>(signal: StateSignal<T>): T {
  if (!isRendering()) {
    return signal.peek();
  }

  return useSyncExternalStore(
    useCallback(onStoreChange => signal.addListener(onStoreChange), [signal]),
    () => signal.peek(),
    () => signal.peek(),
  );
}

export function useDerivedSignal<T, Args extends unknown[]>(signal: DerivedSignal<T, Args>): ReactiveValue<T> {
  if (!isRendering()) {
    return signal.get();
  }

  const value = useSyncExternalStore(
    signal.addListenerLazy(),
    () => signal.get(),
    () => signal.get(),
  );

  // Reactive promises can update their value independently of the signal, since
  // we reuse the same promise object for each result. We need to entangle the
  // version of the promise here so that we can trigger a re-render when the
  // promise value updates.
  //
  // If hooks could be called in dynamic order this would not be necessary, we
  // could entangle the promise when it is used. But, because that is not the
  // case, we need to eagerly entangle.
  if (typeof value === 'object' && value !== null && isReactivePromise(value)) {
    if (isReactiveSubscription(value)) {
      useDerivedSignal(value['_signal'] as DerivedSignal<any, unknown[]>);
    }

    useStateSignal(value['_version']);
  }

  return value as ReactiveValue<T>;
}
