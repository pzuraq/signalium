import { useContext } from 'react';
import { SignalScope, SignalStoreMap } from '../hooks.js';
import { ScopeContext } from './context.js';

export function ContextProvider({
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
