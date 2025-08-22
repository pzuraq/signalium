import { reactive } from 'signalium';

export function useThing() {
  return reactive(() => {
    const x = 10;
    const outer = function (a: number) {
      const inner = function (b: number) {
        return a + b + x;
      };
      return [1, 2, 3].map(inner);
    };
    return [4, 5].map(outer);
  });
}


