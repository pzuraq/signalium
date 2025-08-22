import { reactive, callback as _callback } from 'signalium';

export function useThing() {
  return reactive(() => {
    const obj = {
      method: _callback(function (a: number) {
        return a + 1;
      }, 0)
    };
    return [1, 2, 3].map(obj.method);
  });
}
