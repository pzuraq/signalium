
import { createContext, getContext, reactive, callback as _callback } from "signalium";
const ctx = createContext('default');
const inner = reactive(function* () {
  yield Promise.resolve();
  return 'inner-value';
});
const outer = reactive(function* () {
  const result = yield inner();
  const contextValue = getContext(ctx);
  return result + '-' + contextValue;
});
