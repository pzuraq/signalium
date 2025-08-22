import { reactive } from 'signalium';

export function useThing() {
  return reactive(async function () {
    await fetch('/api');
    return 2;
  });
}
