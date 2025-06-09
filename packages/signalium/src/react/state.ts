import { useRef } from 'react';
import { state } from '../hooks.js';
import { SignalOptions, WriteableSignal } from '../types.js';

export function useStateSignal<T>(value: T, opts?: SignalOptions<T, unknown[]>): WriteableSignal<T> {
  const ref = useRef<WriteableSignal<T> | undefined>(undefined);

  if (!ref.current) {
    ref.current = state(value, opts);
  }

  return ref.current;
}
