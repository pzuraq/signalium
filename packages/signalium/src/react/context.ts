import { createContext, useContext } from 'react';
import { SignalScope } from '../internals/contexts.js';
import { isRendering } from './rendering.js';

export const ScopeContext = createContext<SignalScope | undefined>(undefined);

export function useScope() {
  if (!isRendering()) {
    return undefined;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useContext(ScopeContext);
}
