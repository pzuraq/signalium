import React, { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import { watcher, SignalStoreMap, setConfig, SignalScope, Watcher } from 'signalium';

function useSignalValue<T>(fn: () => T): T {
  const w = useRef<Watcher<T>>(watcher(fn));

  return useSyncExternalStore(
    onStoreChange => {
      return w.current!.addListener(() => onStoreChange(), { immediate: true });
    },

    () => fn(),
  );
}

const ScopeContext = createContext<SignalScope | undefined>(undefined);

setConfig({
  useSignalValue,
  getFrameworkScope: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useContext(ScopeContext);
  },
});

export function ScopeProvider({ children, contexts }: { children: React.ReactNode; contexts: SignalStoreMap }) {
  const scope = new SignalScope(contexts);

  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}
