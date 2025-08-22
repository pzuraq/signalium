import { reactive } from 'signalium';

export function useThing() {
  return reactive(function () {
    const x = 2;
    function add(a: number) {
      return a + x;
    }
    return [1, 2, 3].map(add);
  });
}
