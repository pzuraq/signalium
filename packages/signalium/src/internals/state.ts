import { TRACER as TRACER, TracerEventType } from '../trace.js';
import { SignalEquals, SignalOptions } from '../types.js';
import { DerivedSignal } from './base.js';
import { CURRENT_CONSUMER } from './consumer.js';
import { incrementStateClock } from './clock.js';
import { dirtySignal } from './dirty.js';

let STATE_ID = 0;

export class StateSignal<T> implements StateSignal<T> {
  _value: T;
  _equals: SignalEquals<T>;
  _subs: WeakRef<DerivedSignal<unknown, unknown[]>>[] = [];
  _desc: string;
  _id: number;

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
      this._subs.push(CURRENT_CONSUMER.ref);
    }

    return this._value!;
  }

  update(fn: (value: T) => T) {
    this.set(fn(this._value));
  }

  set(value: T) {
    if (this._equals(value, this._value)) {
      return;
    }

    // console.log('set', this._id, value, this._value, new Error().stack);

    incrementStateClock();

    this._value = value;
    const subs = this._subs;
    const subsLength = subs.length;

    for (let i = 0; i < subsLength; i++) {
      const sub = subs[i].deref();

      if (sub === undefined) {
        continue;
      }

      const prevDirtyState = sub.dirtyState;

      sub.dirtyState = true;

      if (prevDirtyState === false) {
        dirtySignal(sub);
      }
    }

    this._subs = [];
  }
}

const FALSE_EQUALS: SignalEquals<unknown> = () => false;

export function createStateSignal<T>(
  initialValue: T,
  opts?: Omit<SignalOptions<T, unknown[]>, 'paramKey'>,
): StateSignal<T> {
  const equals = opts?.equals === false ? FALSE_EQUALS : (opts?.equals ?? ((a, b) => a === b));

  return new StateSignal(initialValue, equals, opts?.desc);
}
