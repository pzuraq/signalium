import { signaliumAsyncTransform } from './async.js';
import { signaliumCallbackTransform } from './callback.js';

export interface SignaliumTransformOptions {
  transformedImports?: [string, string | RegExp][];
}

// Babel preset that sequences the two plugins just like separate entries
// Usage in babel config: presets: [[require('signalium/transform').signaliumPreset(options)]
export function signaliumPreset(opts?: SignaliumTransformOptions) {
  return {
    plugins: [
      signaliumCallbackTransform({ transformedImports: opts?.transformedImports ?? [] }),
      signaliumAsyncTransform({ transformedImports: opts?.transformedImports ?? [] }),
    ],
  };
}
