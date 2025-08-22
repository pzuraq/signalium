import { reactive, callback as _callback } from 'signalium';

export function useThing() {
  return reactive(() => {
    const x = 1;
    return [1, 2, 3].map(_callback((a: number) => a + x, 0, [x]));
  });
}


