import { DerivedSignal } from './derived.js';

export let CURRENT_CONSUMER: DerivedSignal<any, any> | undefined;

export let IS_WATCHING = false;

export const setIsWatching = (isWatching: boolean) => {
  IS_WATCHING = isWatching;
};

export const setCurrentConsumer = (consumer: DerivedSignal<any, any> | undefined) => {
  CURRENT_CONSUMER = consumer;
};
