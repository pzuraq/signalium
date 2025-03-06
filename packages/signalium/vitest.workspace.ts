/// <reference types="@vitest/browser/providers/playwright" />

import { defineWorkspace } from 'vitest/config';
import react from '@vitejs/plugin-react';
import babel from 'vite-plugin-babel';
import { signaliumAsyncTransform } from './src/transform.js';

export default defineWorkspace([
  {
    plugins: [
      (babel as any)({
        filter: /\.(j|t)sx?$/,
        babelConfig: {
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          plugins: [
            signaliumAsyncTransform({
              transformedImports: [
                ['reactive', /instrumented-hooks.js$/],
                ['task', /instrumented-hooks.js$/],
              ],
            }),
          ],
          parserOpts: {
            plugins: ['typescript'],
          },
        },
      }),
    ],
    test: {
      include: ['src/__tests__/**/*.test.ts'],
      name: 'unit',
      environment: 'node',
    },
  },
  {
    plugins: [
      react({
        babel: {
          plugins: [
            signaliumAsyncTransform({
              transformedImports: [
                ['reactive', /instrumented-hooks.js$/],
                ['task', /instrumented-hooks.js$/],
              ],
            }),
          ],
        },
      }),
    ],
    test: {
      include: ['src/react/__tests__/**/*.test.ts(x)'],
      browser: {
        enabled: true,
        provider: 'playwright',
        instances: [{ browser: 'chromium' }],
      },
    },
  },
]);
