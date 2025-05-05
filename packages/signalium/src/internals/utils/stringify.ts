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
