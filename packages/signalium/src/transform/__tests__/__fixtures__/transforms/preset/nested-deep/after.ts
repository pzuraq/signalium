import { reactive, callback as _callback } from 'signalium';

export function useThing() {
  return reactive(function* () {
    yield fetch('/api');
    const base = 10;
    const outer = _callback(function outer(a: number) {
      const y = a * 2;
      const middle = _callback(function* (b: number) {
        const z = y + b + base;
        const inner = _callback(function* (c: number) {
          return a + b + c + base + y + z;
        }, 0, [a, b, base, y, z]);
        return [1, 2].map(inner);
      }, 0, [y, base, a]);
      return [3, 4].map(middle);
    }, 0, [base]);
    return [5, 6].map(outer);
  });
}
