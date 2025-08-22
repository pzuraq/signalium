import { createContext, getContext, reactive } from "signalium";

const ctx = createContext('default');

const inner = reactive(async () => {
  await Promise.resolve();
  return 'inner-value';
});

const outer = reactive(async () => {
  const result = await inner();

  // Use context after awaiting inner result
  const contextValue = getContext(ctx);
  return result + '-' + contextValue;
});
