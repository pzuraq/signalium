import { ReactiveFnSignal } from './reactive.js';

export let CURRENT_CONSUMER: ReactiveFnSignal<any, any> | undefined;

export let IS_WATCHING = false;

export const setIsWatching = (isWatching: boolean) => {
  IS_WATCHING = isWatching;
};

export const setCurrentConsumer = (consumer: ReactiveFnSignal<any, any> | undefined) => {
  CURRENT_CONSUMER = consumer;
};
