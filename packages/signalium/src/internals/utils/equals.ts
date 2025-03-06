import { SignalEquals } from '../../types.js';

const DEFAULT_EQUALS: SignalEquals<unknown> = (a, b) => a === b;
const FALSE_EQUALS: SignalEquals<unknown> = () => false;

export const equalsFrom = <T>(equals: SignalEquals<T> | false | undefined): SignalEquals<T> => {
  if (equals === false) {
    return FALSE_EQUALS;
  }

  return equals ?? DEFAULT_EQUALS;
};
