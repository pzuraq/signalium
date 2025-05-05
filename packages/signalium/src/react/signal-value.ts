/* eslint-disable react-hooks/rules-of-hooks */
import React, { useCallback, useSyncExternalStore } from 'react';
import type { DerivedSignal } from '../internals/derived.js';
import type { StateSignal } from '../internals/state.js';
import type { ReactiveValue } from '../types.js';
import { isReactivePromise } from '../internals/utils/type-utils.js';
import { isReactiveSubscription } from '../internals/async.js';

// This is a private React internal that we need to access to check if we are rendering.
// There is no other consistent way to check if we are rendering in both development
// and production, and it doesn't appear that the React team wants to add one. This
// should be checked on every major React version upgrade.
const REACT_INTERNALS =
  (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED ||
  (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
  (React as any).__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const ReactCurrentDispatcher = REACT_INTERNALS.ReactCurrentDispatcher || REACT_INTERNALS;
const ReactCurrentOwner = REACT_INTERNALS.ReactCurrentOwner || REACT_INTERNALS;

const getReactCurrentDispatcher = () => {
  return ReactCurrentDispatcher.current || REACT_INTERNALS.H;
};

const getReactCurrentOwner = () => {
  return ReactCurrentOwner.current || REACT_INTERNALS.A;
};

function isRendering() {
  return !!getReactCurrentDispatcher() && !!getReactCurrentOwner();
}

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

export function useDerivedSignal<T>(signal: DerivedSignal<T, unknown[]>): ReactiveValue<T> {
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
