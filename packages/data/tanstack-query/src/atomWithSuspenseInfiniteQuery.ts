import {
  DefaultError,
  InfiniteData,
  InfiniteQueryObserver,
  QueryClient,
  QueryKey,
  QueryObserver,
} from '@tanstack/query-core';
import { Getter, WritableAtom, atom } from 'jotai';
import { baseAtomWithQuery } from './baseAtomWithQuery.js';
import { queryClientAtom } from './queryClientAtom.js';
import { AtomWithSuspenseInfiniteQueryOptions, AtomWithSuspenseInfiniteQueryResult } from './types.js';
import { defaultThrowOnError } from './utils.js';

export function atomWithSuspenseInfiniteQuery<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  getOptions: (
    get: Getter,
  ) => AtomWithSuspenseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey, TPageParam>,
  getQueryClient: (get: Getter) => QueryClient = get => get(queryClientAtom),
): WritableAtom<AtomWithSuspenseInfiniteQueryResult<TData, TError>, [], void> {
  const suspenseOptionsAtom = atom(get => {
    const options = getOptions(get);
    return {
      ...options,
      enabled: true,
      suspense: true,
      throwOnError: defaultThrowOnError,
    };
  });

  return baseAtomWithQuery(
    (get: Getter) => get(suspenseOptionsAtom),
    InfiniteQueryObserver as typeof QueryObserver,
    getQueryClient,
  ) as unknown as WritableAtom<AtomWithSuspenseInfiniteQueryResult<TData, TError>, [], void>;
}
