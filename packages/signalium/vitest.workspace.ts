/// <reference types="@vitest/browser/providers/playwright" />

import { defineWorkspace } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineWorkspace([
  {
    test: {
      include: ['src/__tests__/hooks/**.test.ts'],
      name: 'unit',
      environment: 'node',
    },
  },
  // {
  //   plugins: [react()],
  //   test: {
  //     browser: {
  //       enabled: true,
  //       provider: 'playwright',
  //       instances: [{ browser: 'chromium' }],
  //     },
  //   },
  // },
]);
