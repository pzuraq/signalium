import { reactive, callback as _callback } from 'signalium';

export function useThing() {
  return reactive(function () {
    const x = 2;
    return [1, 2, 3].map(_callback(function add(a: number) {
      return a + x;
    }, 0, [x]));
  });
}


