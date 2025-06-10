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

export function isRendering() {
  const dispatcher = IS_REACT_18 ? ReactCurrentDispatcher.current : ReactCurrentDispatcher.H;

  return (
    !!dispatcher &&
    // dispatcher can be in a state where it's defined, but all hooks are invalid to call.
    // Only way we can tell is that if they are invalid, they will all be equal to each other
    // (e.g. because it's the function that throws an error)
    dispatcher.useState !== dispatcher.useEffect
  );
}
