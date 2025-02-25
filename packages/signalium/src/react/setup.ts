import { setConfig } from '../config.js';
import { useScope } from './context.js';
import { useSignalValue } from './signal-value.js';

export function setupReact() {
  setConfig({
    useSignalValue,
    getFrameworkScope: useScope,
  });
}
