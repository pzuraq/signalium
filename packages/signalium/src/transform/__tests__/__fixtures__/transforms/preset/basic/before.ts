import { reactive } from 'signalium';

export function useThing() {
  return reactive(async () => {
    await fetch('/api');
    const arr = [1, 2, 3];
    return arr.map(function add(a: number) { return a + 1; });
  });
}
