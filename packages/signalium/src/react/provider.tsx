import { useContext } from 'react';
import { ScopeContext } from './context.js';
import { ContextImpl, ContextPair, SignalScope } from '../internals/contexts.js';

export function ContextProvider<C extends unknown[]>({
  children,
  contexts,
  inherit = true,
  root = false,
}: {
  children: React.ReactNode;
  contexts: [...ContextPair<C>];
  inherit?: boolean;
  root?: boolean;
}) {
  // if (root) {
  //   useEffect(() => )

  //   return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
  // }

  const parentScope = useContext(ScopeContext);
  const scope = new SignalScope(contexts as [ContextImpl<unknown>, unknown][], inherit ? parentScope : undefined);

  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}
