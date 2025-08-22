import { reactive } from 'signalium';

export function useThing() {
  return reactive(() => {
    const x = 1;
    return [1, 2, 3].map((a: number) => a + x);
  });
}


