import { createContext, useContext } from 'react';
import { SignalScope } from '../internals/contexts.js';

export const ScopeContext = createContext<SignalScope | undefined>(undefined);

export function useScope() {
  return useContext(ScopeContext);
}
