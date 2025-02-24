import { expect } from 'vitest';
import { AsyncResult } from '../../types.js';

export const result = <T>(
  value: T | undefined,
  promiseState: 'pending' | 'error' | 'success',
  readyState: 'initial' | 'ready' | 'resolved',
  error?: any,
): AsyncResult<T> =>
  ({
    result: value,
    error,
    isPending: promiseState === 'pending',
    isError: promiseState === 'error',
    isSuccess: promiseState === 'success',

    isReady: readyState === 'ready' || readyState === 'resolved',
    didResolve: readyState === 'resolved',

    await: expect.any(Function),
    invalidate: expect.any(Function),
  }) as AsyncResult<T>;
