import { reactive } from 'signalium';

export function useThing() {
  return reactive(() => {
    const obj = {
      method(a: number) {
        return a + 1;
      },
    };

    return [1, 2, 3].map(obj.method);
  });
}
