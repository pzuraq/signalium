import { reactive } from 'signalium';

export function useThing() {
  return reactive(async () => {
    await fetch('/api');
    const base = 10;
    function outer(a: number) {
      const y = a * 2;
      const middle = async function (b: number) {
        const z = y + b + base;
        const inner = async (c: number) => a + b + c + base + y + z;
        return [1, 2].map(inner);
      };
      return [3, 4].map(middle);
    }
    return [5, 6].map(outer);
  });
}
