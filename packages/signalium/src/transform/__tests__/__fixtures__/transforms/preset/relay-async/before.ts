import { reactive, relay, signal } from 'signalium'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const value = signal('Hello');

const derived = reactive(() => {
  return relay<string>(state => {
    const run = async () => {
      await sleep(100);

      try {
        return `${value.value}, World`;
      } catch (e) {
        console.error(e);
        return 'Error';
      }
    };

    state.setPromise(run());
  });
});
