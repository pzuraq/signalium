import { DerivedSignal } from './base.js';

export let CURRENT_CONSUMER: DerivedSignal<any, any> | undefined;

export const setCurrentConsumer = (consumer: DerivedSignal<any, any> | undefined) => {
  CURRENT_CONSUMER = consumer;
};
