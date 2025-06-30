import React from 'react';

// This is a private React internal that we need to access to check if we are rendering.
// There is no other consistent way to check if we are rendering in both development
// and production, and it doesn't appear that the React team wants to add one. This
// should be checked on every major React version upgrade.
const REACT_INTERNALS =
  (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED ||
  (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
  (React as any).__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const IS_REACT_18 = !!REACT_INTERNALS.ReactCurrentDispatcher;
const ReactCurrentDispatcher = REACT_INTERNALS.ReactCurrentDispatcher || REACT_INTERNALS;

let RENDERING_SAFE_MODE_COUNT = 0;

/**
 * Reactive functions can be called anywhere, but React Hooks cannot. When calling reactive functions
 * in code that _may or may not_ be used while rendering, we need to use this function to wrap the
 * call. This will ensure that we will not be in a rendering context when the reactive function is called.
 */
export const runReactiveSafe = <T>(fn: () => T): T => {
  RENDERING_SAFE_MODE_COUNT++;

  try {
    return fn();
  } finally {
    RENDERING_SAFE_MODE_COUNT--;
  }
};

export function isRendering() {
  const dispatcher = IS_REACT_18 ? ReactCurrentDispatcher.current : ReactCurrentDispatcher.H;

  return (
    RENDERING_SAFE_MODE_COUNT === 0 &&
    !!dispatcher &&
    // dispatcher can be in a state where it's defined, but all hooks are invalid to call.
    // Only way we can tell is that if they are invalid, they will all be equal to each other
    // (e.g. because it's the function that throws an error)
    dispatcher.useState !== dispatcher.useEffect
  );
}
