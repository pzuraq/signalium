import { reactive, callback as _callback } from 'signalium';

export function useThing() {
  return reactive(() => {
    const add = _callback(function add(a: number) {
      return a + 1;
    }, 0);
    return [1, 2, 3].map(add);
  });
}
