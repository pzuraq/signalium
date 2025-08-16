import { setConfig } from '../config.js';
import { useScope } from './context.js';

export function setupReact() {
  setConfig({
    getFrameworkScope: useScope,
  });
}
