import { getPersistenceStore } from '../config.js';
import { PersistConfig } from '../types.js';
import { ReactivePromise } from './async.js';
import { DerivedSignal, isSubscription, SignalId } from './derived.js';
import { isPromise } from './utils/type-utils.js';

export type PersistedType = 'promise' | 'value';

export type PersistedValue<T> = [type: PersistedType, value: T];

export interface ReifiedPersistConfig<T, Args extends unknown[]> extends PersistConfig<T, Args, unknown> {
  hydrate: ((value: unknown, ...args: Args) => T) | undefined;
  dehydrate: ((value: T, ...args: Args) => unknown) | undefined;
  args: Args;
  argsKey: SignalId | undefined;
}

export function reifyPersistConfig<T, Args extends unknown[]>(
  persistConfig: PersistConfig<T, Args>,
  args: Args,
  argsKey: SignalId | undefined,
): ReifiedPersistConfig<T, Args> {
  return {
    args,
    argsKey,
    hydrate: persistConfig.hydrate,
    dehydrate: persistConfig.dehydrate,
    key: persistConfig.key,
  };
}

/**
 * Generate a storage key from a base key and function arguments
 */
export function getStorageKey<T, Args extends unknown[]>(key: string, argsKey?: SignalId): string {
  if (argsKey === undefined) {
    return key;
  }

  return `${key}:${argsKey}`;
}

export function serialize<T>(value: T, isPromise: boolean): PersistedValue<T> {
  return [isPromise ? 'promise' : 'value', value];
}

/**
 * Persist a value to storage
 * Uses batching for better performance
 */
export async function persist<T, Args extends unknown[]>(
  persistConfig: ReifiedPersistConfig<T, Args>,
  value: T,
): Promise<void> {
  const store = getPersistenceStore();
  if (!store) return;

  try {
    const fullKey = getStorageKey(persistConfig.key, persistConfig.argsKey);

    const isObject = value !== null && typeof value === 'object';

    if (isObject && isSubscription(value)) {
      throw new Error('Reactive functions that return subscriptions cannot be persisted.');
    }

    const isPromiseValue = isObject && isPromise(value);

    const resolvedValue = isPromiseValue ? await value : value;

    // Use dehydrate function if provided, otherwise use the value directly
    const valueToStore = persistConfig.dehydrate
      ? persistConfig.dehydrate(resolvedValue, ...persistConfig.args)
      : resolvedValue;

    store.set(fullKey, serialize(valueToStore, isPromiseValue));
  } catch (e) {
    // Silent failure - persistence is lossy
  }
}

/**
 * Retrieve a persisted value from storage
 */
export function hydrate<T, Args extends unknown[]>(
  persistConfig: ReifiedPersistConfig<Awaited<T>, Args>,
  signal?: DerivedSignal<T, Args>,
): Awaited<T> | undefined {
  const store = getPersistenceStore();
  if (!store) return undefined;

  try {
    const fullKey = getStorageKey(persistConfig.key, persistConfig.argsKey);
    const serialized = store.get(fullKey);

    if (serialized === undefined) return undefined;

    const [type, value] = serialized;

    // Call the user's hydrate function to restore the value and track any
    // dependencies that need to be entangled
    const hydratedValue = persistConfig.hydrate ? persistConfig.hydrate(value, ...persistConfig.args) : value;

    return (
      type === 'promise'
        ? ReactivePromise.createFromPersisted(hydratedValue, signal as DerivedSignal<any, any>)
        : hydratedValue
    ) as Awaited<T>;
  } catch (e) {
    // Silent failure - persistence is lossy
    return undefined;
  }
}
