import { setConfig } from '../config.js';
import { useScope } from './context.js';
import { useDerivedSignal, useStateSignal } from './signal-value.js';

export function setupReact() {
  setConfig({
    useDerivedSignal,
    useStateSignal,
    getFrameworkScope: useScope,
  });
}
