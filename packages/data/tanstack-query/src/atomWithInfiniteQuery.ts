import {
  DefaultError,
  InfiniteData,
  InfiniteQueryObserver,
  QueryClient,
  QueryKey,
  QueryObserver,
} from '@tanstack/query-core';
import { Getter, WritableAtom } from 'jotai';
import { baseAtomWithQuery } from './baseAtomWithQuery.js';
import { queryClientAtom } from './queryClientAtom.js';
import {
  AtomWithInfiniteQueryOptions,
  AtomWithInfiniteQueryResult,
  DefinedAtomWithInfiniteQueryResult,
  DefinedInitialDataInfiniteOptions,
  UndefinedInitialDataInfiniteOptions,
} from './types.js';

export function atomWithInfiniteQuery<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  getOptions: (get: Getter) => UndefinedInitialDataInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  getQueryClient?: (get: Getter) => QueryClient,
): WritableAtom<AtomWithInfiniteQueryResult<TData, TError>, [], void>;
export function atomWithInfiniteQuery<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  getOptions: (get: Getter) => DefinedInitialDataInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  getQueryClient?: (get: Getter) => QueryClient,
): WritableAtom<DefinedAtomWithInfiniteQueryResult<TData, TError>, [], void>;
export function atomWithInfiniteQuery<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  getOptions: (
    get: Getter,
  ) => AtomWithInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey, TPageParam>,
  getQueryClient?: (get: Getter) => QueryClient,
): WritableAtom<AtomWithInfiniteQueryResult<TData, TError>, [], void>;
export function atomWithInfiniteQuery(
  getOptions: (get: Getter) => AtomWithInfiniteQueryOptions,
  getQueryClient: (get: Getter) => QueryClient = get => get(queryClientAtom),
) {
  return baseAtomWithQuery(getOptions, InfiniteQueryObserver as typeof QueryObserver, getQueryClient);
}
