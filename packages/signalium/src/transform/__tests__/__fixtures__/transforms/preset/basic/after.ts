import { reactive, callback as _callback } from 'signalium';

export function useThing() {
  return reactive(function* () {
    yield fetch('/api');
    const arr = [1, 2, 3];
    return arr.map(_callback(function add(a: number) {
      return a + 1;
    }, 0));
  });
}
