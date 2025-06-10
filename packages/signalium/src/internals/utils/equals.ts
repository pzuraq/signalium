import { SignalEquals } from '../../types.js';

export const DEFAULT_EQUALS: SignalEquals<unknown> = (a, b) => a === b;
export const FALSE_EQUALS: SignalEquals<unknown> = () => false;

export const equalsFrom = <T>(equals: SignalEquals<T> | false | undefined): SignalEquals<T> => {
  if (equals === false) {
    return FALSE_EQUALS;
  }

  return equals ?? DEFAULT_EQUALS;
};
