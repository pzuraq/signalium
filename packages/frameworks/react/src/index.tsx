import React, { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import { watcher, SignalStoreMap, setConfig, SignalScope, Watcher } from 'signalium';

export function useSignalValue<T>(fn: () => T): T {
  const scope = useContext(ScopeContext);
  const w = useRef<Watcher<T> | undefined>(undefined);

  if (w.current === undefined) {
    w.current = watcher(fn, { scope: scope });
  }

  return useSyncExternalStore(
    onStoreChange => {
      return w.current!.addListener(() => onStoreChange(), { immediate: true });
    },

    fn,
  );
}

export const ScopeContext = createContext<SignalScope | undefined>(undefined);

export function useScope() {
  return useContext(ScopeContext);
}

export function ScopeProvider({
  children,
  contexts,
  inherit = true,
}: {
  children: React.ReactNode;
  contexts: SignalStoreMap;
  inherit?: boolean;
}) {
  const parentScope = useContext(ScopeContext);
  const scope = new SignalScope(contexts, inherit ? parentScope : undefined);

  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}

export function setupSignaliumReact() {
  setConfig({
    useSignalValue,
    // eslint-disable-next-line react-hooks/rules-of-hooks
    getFrameworkScope: () => useContext(ScopeContext),
  });
}
