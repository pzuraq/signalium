import { ComputedSignal } from './base.js';

export let CURRENT_CONSUMER: ComputedSignal<any, any> | undefined;

export const setCurrentConsumer = (consumer: ComputedSignal<any, any> | undefined) => {
  CURRENT_CONSUMER = consumer;
};
