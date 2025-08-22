import { reactive } from 'signalium';

export function useThing() {
  return reactive(async () => {
    await fetch('/api');
    return 1;
  });
}
