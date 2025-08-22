import { reactive } from 'signalium';

export function useThing() {
  return reactive(function* () {
    yield fetch('/api');
    return 1;
  });
}
