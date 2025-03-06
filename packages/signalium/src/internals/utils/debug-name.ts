let UNKNOWN_SIGNAL_ID = 0;
const UNKNOWN_SIGNAL_NAMES = new Map<object, string>();

export function getUnknownSignalFnName(fn: object) {
  let name = UNKNOWN_SIGNAL_NAMES.get(fn);

  if (name === undefined) {
    name = `unknownSignal${UNKNOWN_SIGNAL_ID++}`;

    UNKNOWN_SIGNAL_NAMES.set(fn, name);
  }

  return name;
}
