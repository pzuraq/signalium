import { reactive, callback as _callback } from 'signalium';

export function useThing() {
  return reactive(() => {
    return [1, 2, 3].map(_callback((a: number) => a + 1, 0));
  });
}
