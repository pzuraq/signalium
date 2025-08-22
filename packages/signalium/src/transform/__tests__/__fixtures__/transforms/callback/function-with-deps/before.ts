import { reactive } from 'signalium';

export function useThing() {
  return reactive(function () {
    const x = 2;
    return [1, 2, 3].map(function add(a: number) {
      return a + x;
    });
  });
}


