import { reactive } from 'signalium';

export function useThing() {
  return reactive(() => {
    function add(a: number) {
      return a + 1;
    }
    return [1, 2, 3].map(add);
  });
}
