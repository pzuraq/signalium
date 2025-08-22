import { reactive, callback as _callback } from 'signalium';

export function useThing() {
  return reactive(() => {
    const x = 3;
    const obj = {
      method: _callback(function (a: number) {
        return a + x;
      }, 0, [x])
    };
    return [1, 2, 3].map(obj.method);
  });
}


