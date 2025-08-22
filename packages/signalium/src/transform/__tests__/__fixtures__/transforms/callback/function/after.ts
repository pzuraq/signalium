import { reactive, callback as _callback } from 'signalium';

export function useThing() {
  return reactive(() => {
    return [1, 2, 3].map(_callback(function add(a: number) {
      return a + 1;
    }, 0));
  });
}
