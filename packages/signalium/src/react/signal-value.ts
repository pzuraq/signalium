import { useContext, useEffect, useRef, useState } from 'react';
import { ScopeContext } from './context.js';
import { watcher } from '../hooks.js';
import { setConfig } from '../config.js';

export function useSignalValue<T>(key: string, fn: () => T): T {
  const [, setVersion] = useState(0);
  const scope = useContext(ScopeContext);
  const ref = useRef<{
    value: T | undefined;
    unsub: (() => void) | undefined;
    key: string | undefined;
  }>({
    value: undefined,
    unsub: undefined,
    key: undefined,
  });

  const currentKey = ref.current.key;

  if (key !== currentKey) {
    ref.current.unsub?.();

    const w = watcher(fn, { scope });

    let initialized = false;

    ref.current.unsub = w.addListener(
      value => {
        ref.current.value = value;

        // Trigger an update to the component
        if (initialized) {
          setVersion(v => v + 1);
        }

        initialized = true;
      },
      {
        immediate: true,
      },
    );

    ref.current.key = key;
  }

  useEffect(() => ref.current.unsub, []);

  return ref.current.value!;
}

export function setupReact() {
  setConfig({
    useSignalValue,
  });
}
