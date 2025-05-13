import { SignalEquals } from '../../types.js';
import { untrack } from '../get.js';
import { persist, ReifiedPersistConfig } from '../persistence.js';

const DEFAULT_EQUALS: SignalEquals<unknown> = (prev, next) => prev === next;
const FALSE_EQUALS: SignalEquals<unknown> = () => false;

export type ShouldUpdate<T> = (isInitialized: boolean, prev: T | undefined, next: T) => boolean;

export const createShouldUpdate = <T>(
  equalsConfig: SignalEquals<T> | false | undefined,
  persistConfig?: ReifiedPersistConfig<T, any[]>,
): ShouldUpdate<T> => {
  const equals = equalsFrom(equalsConfig);

  const shouldUpdate = (isInitialized: boolean, prev: T | undefined, next: T) => !isInitialized || !equals(prev!, next);

  return persistConfig
    ? (isInitialized, prev, next) => {
        let result = shouldUpdate(isInitialized, prev, next);

        if (result) {
          untrack(() => persist(persistConfig, next));
        }

        return result;
      }
    : shouldUpdate;
};

const equalsFrom = <T>(equalsConfig: SignalEquals<T> | false | undefined): SignalEquals<T> => {
  let equals: SignalEquals<T>;

  if (equalsConfig === false) {
    equals = FALSE_EQUALS;
  } else if (equalsConfig === undefined) {
    equals = DEFAULT_EQUALS;
  } else {
    equals = equalsConfig;
  }

  return equals;
};
