import { reactive } from 'signalium';

export function useThing() {
  return reactive(() => {
    const x = 3;
    const obj = {
      method(a: number) {
        return a + x;
      },
    };

    return [1, 2, 3].map(obj.method);
  });
}


