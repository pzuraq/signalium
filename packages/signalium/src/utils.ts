import { SignalType } from './signals/base.js';

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

export function stringifyValue(value: unknown): string {
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
        return `[${value.map(stringifyValue).join(',')}]`;
      }
      if (isPOJO(value)) {
        const entries = [
          ...Object.entries(value),
          ...Object.getOwnPropertySymbols(value).map(sym => [sym, value[sym as keyof typeof value]]),
        ].sort(([a], [b]) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));

        return `{ ${entries.map(([k, v]) => `${String(k)}: ${stringifyValue(v)}`).join(', ')} }`;
      }
      return getObjectId(value);
    }
    case 'function':
      return getObjectId(value);
    default:
      return getObjectId(value as object);
  }
}

function hashStr(key: string, seed = 0) {
  let h = seed ^ key.length;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let i = 0;
  while (i + 4 <= key.length) {
    let k =
      (key.charCodeAt(i) & 0xff) |
      ((key.charCodeAt(i + 1) & 0xff) << 8) |
      ((key.charCodeAt(i + 2) & 0xff) << 16) |
      ((key.charCodeAt(i + 3) & 0xff) << 24);
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 5) + 0xe6546b64;
    i += 4;
  }
  let k = 0;
  switch (key.length & 3) {
    case 3:
      k ^= (key.charCodeAt(i + 2) & 0xff) << 16;
    // eslint-disable-next-line no-fallthrough
    case 2:
      k ^= (key.charCodeAt(i + 1) & 0xff) << 8;
    // eslint-disable-next-line no-fallthrough
    case 1:
      k ^= key.charCodeAt(i) & 0xff;
      k = Math.imul(k, c1);
      k = (k << 15) | (k >>> 17);
      k = Math.imul(k, c2);
      h ^= k;
  }
  h ^= key.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0; // Convert to unsigned 32-bit integer
}

const enum HashType {
  UNDEFINED = 0,
  NULL = 1,
  TRUE = 2,
  FALSE = 3,
  NUMBER = 4,
  STRING = 5,
  BIGINT = 6,
  ARRAY = 7,
  OBJECT = 8,
  REFERENCE = 9,
  SYMBOL = 10,
  CYCLE = 11,
}

const UNDEFINED = hashStr('undefined', HashType.UNDEFINED);
const NULL = hashStr('null', HashType.NULL);
const TRUE = hashStr('true', HashType.TRUE);
const FALSE = hashStr('false', HashType.FALSE);
const ARRAY = hashStr('array', HashType.ARRAY);
const OBJECT = hashStr('object', HashType.OBJECT);
const isArray = Array.isArray;
const objectProto = Object.prototype;
const getObjectProto = Object.getPrototypeOf;

export function hashValue(node: unknown, seen: unknown[] = []) {
  switch (typeof node) {
    case 'undefined':
      return UNDEFINED;
    case 'boolean':
      return node ? TRUE : FALSE;
    case 'number':
      return hashStr(String(node), HashType.NUMBER);
    case 'string':
      return hashStr(node, HashType.STRING);
    case 'bigint':
      return hashStr(node.toString(), HashType.BIGINT);
    case 'object': {
      if (node === null) {
        return NULL;
      }

      if (isArray(node)) {
        let sum = ARRAY;
        for (const item of node) {
          sum = (sum * 33) ^ hashValue(item, seen);
        }
        return sum >>> 0;
      }

      if (getObjectProto(node) !== objectProto) {
        return hashStr(getObjectId(node), HashType.REFERENCE);
      }

      const index = seen.indexOf(node);
      if (index !== -1) {
        return hashStr(String(index), HashType.CYCLE);
      }

      let sum = OBJECT;
      const keys = Object.keys(node);

      seen.push(node);

      for (const key of keys) {
        sum += hashValue(key) ^ hashValue((node as any)[key], seen);
      }
      seen.pop();

      return sum >>> 0;
    }
    case 'function':
      return hashStr(getObjectId(node), HashType.REFERENCE);
    case 'symbol':
      return hashStr(node.toString(), HashType.SYMBOL);
  }
}

let UNKNOWN_SUBSCRIPTION_ID = 0;
let UNKNOWN_COMPUTED_ID = 0;
let UNKNOWN_ASYNC_COMPUTED_ID = 0;
let UNKNOWN_ASYNC_TASK_ID = 0;
let UNKNOWN_WATCHER_ID = 0;

const UNKNOWN_SIGNAL_NAMES = new Map<object, string>();

export function getUnknownSignalFnName(type: SignalType, fn: object) {
  let name = UNKNOWN_SIGNAL_NAMES.get(fn);

  if (name === undefined) {
    if (type === SignalType.Subscription) {
      name = `unknownSubscription${UNKNOWN_SUBSCRIPTION_ID++}`;
    } else if (type === SignalType.Computed) {
      name = `unknownComputed${UNKNOWN_COMPUTED_ID++}`;
    } else if (type === SignalType.AsyncComputed) {
      name = `unknownAsyncComputed${UNKNOWN_ASYNC_COMPUTED_ID++}`;
    } else if (type === SignalType.AsyncTask) {
      name = `unknownAsyncTask${UNKNOWN_ASYNC_TASK_ID++}`;
    } else {
      name = `unknownWatcher${UNKNOWN_WATCHER_ID++}`;
    }

    UNKNOWN_SIGNAL_NAMES.set(fn, name);
  }

  return name;
}
