import { createComputedSignal, createSubscriptionSignal } from './signals.js';

const objectToIdMap = new WeakMap<object, string>();
let nextId = 1;

export function getObjectId(obj: object): string {
  let id = objectToIdMap.get(obj);
  if (id === undefined) {
    id = `obj-${nextId++}`;
    objectToIdMap.set(obj, id);
  }
  return id;
}

// Handle basic POJOs and arrays recursively
function isPOJO(obj: object): boolean {
  return Object.getPrototypeOf(obj) === Object.prototype;
}

function isPlainArray(arr: unknown): arr is unknown[] {
  return Array.isArray(arr);
}

export function hashValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  switch (typeof value) {
    case 'number':
    case 'boolean':
    case 'string':
      return String(value);
    case 'bigint':
      return value.toString();
    case 'symbol':
      return String(value);
    case 'object': {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (isPlainArray(value)) {
        return `[${value.map(hashValue).join(',')}]`;
      }
      if (isPOJO(value)) {
        const entries = [
          ...Object.entries(value),
          ...Object.getOwnPropertySymbols(value).map(sym => [sym, value[sym as keyof typeof value]]),
        ].sort(([a], [b]) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));

        return `{ ${entries.map(([k, v]) => `${String(k)}: ${hashValue(v)}`).join(', ')} }`;
      }
      return getObjectId(value);
    }
    case 'function':
      return getObjectId(value);
    default:
      return getObjectId(value as object);
  }
}

let UNKNOWN_SUBSCRIPTION_ID = 0;
let UNKNOWN_COMPUTED_ID = 0;
let UNKNOWN_ASYNC_COMPUTED_ID = 0;

const UNKNOWN_SIGNAL_NAMES = new Map<object, string>();

export function getUnknownSignalFnName(fn: object, makeSignal: unknown) {
  let name = UNKNOWN_SIGNAL_NAMES.get(fn);

  if (name === undefined) {
    if (makeSignal === createSubscriptionSignal) {
      name = `unknownSubscription${UNKNOWN_SUBSCRIPTION_ID++}`;
    } else if (makeSignal === createComputedSignal) {
      name = `unknownComputed${UNKNOWN_COMPUTED_ID++}`;
    } else {
      name = `unknownAsyncComputed${UNKNOWN_ASYNC_COMPUTED_ID++}`;
    }

    UNKNOWN_SIGNAL_NAMES.set(fn, name);
  }

  return name;
}
