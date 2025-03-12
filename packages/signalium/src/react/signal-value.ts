/* eslint-disable react-hooks/rules-of-hooks */
import React, { useCallback, useContext, useRef, useState, useSyncExternalStore } from 'react';
import { ScopeContext } from './context.js';
import { watcher } from '../hooks.js';

// This is a private React internal that we need to access to check if we are rendering.
// There is no other consistent way to check if we are rendering in both development
// and production, and it doesn't appear that the React team wants to add one. This
// should be checked on every major React version upgrade.
const REACT_INTERNALS =
  (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED ||
  (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const ReactCurrentDispatcher = REACT_INTERNALS.ReactCurrentDispatcher || REACT_INTERNALS;

const getReactCurrentDispatcher = () => {
  return ReactCurrentDispatcher?.current || ReactCurrentDispatcher?.A || null;
};

function isRendering() {
  return getReactCurrentDispatcher() !== null;
}

export function useSignalValue<T>(key: string, fn: () => T): T {
  if (!isRendering()) {
    return fn();
  }

  const [, setVersion] = useState(0);
  const scope = useContext(ScopeContext);
  const ref = useRef<{
    value: T | undefined;
    sub: (() => () => void) | undefined;
    unsub: (() => void) | undefined;
    key: string | undefined;
  }>({
    value: undefined,
    sub: undefined,
    unsub: undefined,
    key: undefined,
  });

  const currentKey = ref.current.key;

  if (key !== currentKey) {
    ref.current.unsub?.();

    const w = watcher(fn, { scope });

    let initialized = false;

    ref.current.sub = () => {
      if (ref.current.unsub) {
        return ref.current.unsub;
      }

      const unsub = w.addListener(
        value => {
          ref.current.value = value;

          // Trigger an update to the component
          if (initialized) {
            setVersion(v => v + 1);
          }

          initialized = true;
        },
        {
          immediate: true,
        },
      );

      ref.current.unsub = () => {
        ref.current.unsub = undefined;
        unsub();
      };

      return ref.current.unsub!;
    };

    ref.current.sub!();

    ref.current.key = key;
  }

  useSyncExternalStore(
    ref.current.sub!,
    () => ref.current.value!,
    () => ref.current.value!,
  );

  return ref.current.value!;
}
