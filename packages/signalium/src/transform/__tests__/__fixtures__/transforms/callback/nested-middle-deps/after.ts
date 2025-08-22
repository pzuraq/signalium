import { reactive, callback as _callback } from 'signalium';

export function useThing() {
  return reactive(() => {
    const outer = _callback(function outer(a: number) {
      const y = a * 2;
      const middle = _callback(function middle(b: number) {
        const z = y + b;
        const inner = _callback(function inner(c: number) {
          return z + c;
        }, 0, [z]);
        return [1, 2, 3].map(inner);
      }, 0, [y]);
      return [4, 5].map(middle);
    }, 0);
    return [6].map(outer);
  });
}


