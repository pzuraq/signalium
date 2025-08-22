import { reactive, callback as _callback } from 'signalium';

export function useThing() {
  return reactive(function () {
    const x = 2;
    const add = _callback(function add(a: number) {
      return a + x;
    }, 0, [x]);
    return [1, 2, 3].map(add);
  });
}
