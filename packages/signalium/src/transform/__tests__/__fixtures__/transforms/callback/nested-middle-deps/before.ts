import { reactive } from 'signalium';

export function useThing() {
  return reactive(() => {
    function outer(a: number) {
      const y = a * 2;
      function middle(b: number) {
        const z = y + b;
        function inner(c: number) {
          return z + c;
        }
        return [1, 2, 3].map(inner);
      }
      return [4, 5].map(middle);
    }
    return [6].map(outer);
  });
}


