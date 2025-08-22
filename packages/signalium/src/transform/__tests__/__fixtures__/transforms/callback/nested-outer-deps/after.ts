import { reactive, callback as _callback } from 'signalium';

export function useThing() {
  return reactive(() => {
    const x = 10;
    const outer = _callback(function (a: number) {
      const inner = _callback(function (b: number) {
        return a + b + x;
      }, 0, [a, x]);
      return [1, 2, 3].map(inner);
    }, 0, [x]);
    return [4, 5].map(outer);
  });
}


