import { TRACER as TRACER, TracerEventType } from '../trace.js';
import { SignalEquals, SignalListener, StateSignalOptions, WriteableSignal } from '../types.js';
import { DerivedSignal, SignalState } from './derived.js';
import { dirtySignal } from './dirty.js';
import { CURRENT_CONSUMER } from './get.js';
import { useStateSignal } from '../config.js';
import { scheduleListeners } from './scheduling.js';

let STATE_ID = 0;

export class StateSignal<T> implements WriteableSignal<T> {
  private _value: T;
  private _equals: SignalEquals<T>;
  private _subs = new Map<WeakRef<DerivedSignal<unknown, unknown[]>>, number>();
  _desc: string;
  _id: number;

  private _listeners: Set<SignalListener> | null = null;

  constructor(value: T, equals: SignalEquals<T> = (a, b) => a === b, desc: string = 'state') {
    this._value = value;
    this._equals = equals;
    this._id = STATE_ID++;
    this._desc = `${desc}${this._id}`;
  }

  get(): T {
    if (CURRENT_CONSUMER !== undefined) {
      TRACER?.emit({
        type: TracerEventType.ConsumeState,
        id: CURRENT_CONSUMER.tracerMeta!.id,
        childId: this._id,
        value: this._value,
        setValue: (value: unknown) => {
          this.set(value as T);
        },
      });
      this._subs.set(CURRENT_CONSUMER.ref, CURRENT_CONSUMER.computedCount);
      return this._value!;
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useStateSignal(this);
  }

  update(fn: (value: T) => T) {
    this.set(fn(this._value));
  }

  peek(): T {
    return this._value;
  }

  set(value: T) {
    if (this._equals(value, this._value)) {
      return;
    }

    this._value = value;
    const { _subs: subs, _listeners: listeners } = this;

    for (const [subRef, consumedAt] of subs.entries()) {
      const sub = subRef.deref();

      if (sub === undefined || consumedAt !== sub.computedCount) {
        continue;
      }

      dirtySignal(sub);
    }

    this._subs = new Map();

    scheduleListeners(this);
  }

  addListener(listener: SignalListener): () => void {
    let listeners = this._listeners;

    if (listeners === null) {
      this._listeners = listeners = new Set();
    }

    listeners.add(listener);

    return () => listeners.delete(listener);
  }
}

export function runListeners(signal: StateSignal<any>) {
  const listeners = signal['_listeners'];

  if (listeners === null) {
    return;
  }

  for (const listener of listeners) {
    listener();
  }
}

const FALSE_EQUALS: SignalEquals<unknown> = () => false;

export function createStateSignal<T>(initialValue: T, opts?: StateSignalOptions<T>): StateSignal<T> {
  const equals = opts?.equals === false ? FALSE_EQUALS : (opts?.equals ?? ((a, b) => a === b));

  return new StateSignal(initialValue, equals, opts?.desc);
}
