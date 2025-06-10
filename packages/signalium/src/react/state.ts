import { useRef } from 'react';
import { state } from '../hooks.js';
import { SignalOptions, StateSignal } from '../types.js';

export function useStateSignal<T>(value: T, opts?: SignalOptions<T, unknown[]>): StateSignal<T> {
  const ref = useRef<StateSignal<T> | undefined>(undefined);

  if (!ref.current) {
    ref.current = state(value, opts);
  }

  return ref.current;
}
