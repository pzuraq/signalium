import WeakRef from '../weakref.js';
import { TRACER, TracerMeta } from '../trace.js';
import {
  AsyncResult,
  AsyncTask,
  SignalEquals,
  SignalOptionsWithInit,
  SignalSubscription,
  SubscriptionState,
} from '../types.js';
import { getUnknownSignalFnName, hashValue, stringifyValue } from './utils.js';
import { createSubscriptionState } from './subscription.js';
import { createAsyncResult, createAsyncTask } from './async.old.js';
import { SignalScope } from './contexts.js';
import { getValue } from './get.js';
import { unreachable } from './type-utils.js';
import { addListener } from './watcher.js';

/**
 * This file contains computed signal base types and struct definitions.
 *
 * Computed signals are monomorphic to make them more efficient, but this also
 * means that multiple fields differ based on the type of the signal. Defining
 * them using this pattern rather than a class allows us to switch on the `type`
 * field to get strong typing in branches everywhere else.
 *
 * "Methods" for this struct are defined in other files for better organization.
 */

const FALSE_EQUALS: SignalEquals<unknown> = () => false;

export type SignalId = number;

export const enum SignalType {
  State,
  Computed,
  Subscription,
  AsyncComputed,
  AsyncTask,
  Watcher,
}

export type DerivedSignalType = Exclude<SignalType, SignalType.State>;

export interface Link {
  dep: DerivedSignal<any, any>;
  sub: WeakRef<DerivedSignal<any, any>>;
  ord: number;
  updatedAt: number;
  consumedAt: number;

  nextDirty: Link | undefined;
}

interface BaseDerivedSignal {
  readonly type: DerivedSignalType;

  scope?: SignalScope;
  deps: Map<DerivedSignal<any, any>, Link>;
  subs: Set<Link>;
  ref: WeakRef<DerivedSignal<any, any>>;

  dirtyState: Link | boolean;
  updatedAt: number;

  connectedCount: number;
  equals: SignalEquals<any>;

  tracerMeta?: TracerMeta;

  currentValue: any;
  compute: (...args: any[]) => any;
  args: any;
}

export interface ComputedSignal<T, Args extends unknown[]> extends BaseDerivedSignal {
  type: SignalType.Computed;
  compute: (...args: Args) => T;
  currentValue: T | undefined;
  args: Args;

  get(): T;
}

export interface AsyncComputedSignal<T, Args extends unknown[]> extends BaseDerivedSignal {
  type: SignalType.AsyncComputed;
  compute: (...args: Args) => T | Promise<T>;
  currentValue: AsyncResult<T>;
  args: Args;

  get(): AsyncResult<T>;
}

export interface AsyncTaskSignal<T, CreateArgs extends unknown[], RunArgs extends unknown[]> extends BaseDerivedSignal {
  type: SignalType.AsyncTask;
  compute: (...args: [...CreateArgs, ...RunArgs]) => Promise<T>;
  currentValue: AsyncTask<T, RunArgs>;
  args: [...CreateArgs, ...RunArgs];

  get(): AsyncTask<T, RunArgs>;
}

export interface SubscriptionSignal<T, Args extends unknown[]> extends BaseDerivedSignal {
  type: SignalType.Subscription;
  compute: (...args: [SubscriptionState<T>, ...Args]) => SignalSubscription | (() => unknown) | undefined;
  currentValue: T | undefined;
  args: [SubscriptionState<T>, ...Args];

  get(): T | undefined;
}

export interface WatcherSignal<T> extends BaseDerivedSignal {
  type: SignalType.Watcher;
  compute: () => T;
  currentValue: { value: T | undefined; listeners: ((value: T) => void)[] };
  args: [];

  addListener(listener: (value: T) => void): void;
}

export interface TypeToSignal<T, Args extends unknown[]> {
  [SignalType.Computed]: ComputedSignal<T, Args>;
  [SignalType.AsyncComputed]: AsyncComputedSignal<T, Args>;
  [SignalType.AsyncTask]: AsyncTaskSignal<T, Args, unknown[]>;
  [SignalType.Subscription]: SubscriptionSignal<T, Args>;
  [SignalType.Watcher]: WatcherSignal<T>;
}

export type DerivedSignal<T, Args extends unknown[]> = TypeToSignal<T, Args>[DerivedSignalType];

class DerivedSignalImpl implements BaseDerivedSignal {
  type: DerivedSignalType;
  scope?: SignalScope;

  deps = new Map<DerivedSignal<any, any>, Link>();
  subs = new Set<Link>();

  ref: WeakRef<DerivedSignal<any, any>> = new WeakRef(this as DerivedSignal<any, any>);

  equals: SignalEquals<any>;
  dirtyState: Link | boolean = true;
  updatedAt: number = -1;
  connectedCount: number = 0;

  compute: (...args: any[]) => any;
  args: any;
  currentValue: any;

  tracerMeta?: TracerMeta;

  constructor(
    type: DerivedSignalType,
    compute: (...args: any[]) => any,
    args: any[],
    key?: SignalId,
    scope?: SignalScope,
    opts?: Partial<SignalOptionsWithInit<any, any[]>>,
  ) {
    this.type = type;
    this.scope = scope;
    this.compute = compute;
    this.equals = opts?.equals === false ? FALSE_EQUALS : (opts?.equals ?? ((a, b) => a === b));
    this.args = args;

    switch (type) {
      case SignalType.Computed: {
        this.currentValue = opts?.initValue;
        break;
      }

      case SignalType.Subscription: {
        this.args = [createSubscriptionState(this as SubscriptionSignal<any, any>), ...args];
        this.currentValue = createSubscription(this as SubscriptionSignal<any, any>, opts?.initValue);
        break;
      }

      case SignalType.AsyncComputed: {
        this.currentValue = createAsyncResult(this as AsyncComputedSignal<any, any>, opts?.initValue);
        break;
      }

      case SignalType.AsyncTask: {
        this.currentValue = createAsyncTask(this as AsyncTaskSignal<any, any, any[]>, opts?.initValue);
        break;
      }

      case SignalType.Watcher: {
        this.currentValue = { value: undefined, listeners: [] };
        break;
      }

      default: {
        unreachable(type);
      }
    }

    if (TRACER) {
      this.tracerMeta = {
        id: key ?? hashValue([compute, ID++]),
        desc: opts?.desc ?? compute.name ?? getUnknownSignalFnName(type, compute),
        params: args.map(arg => stringifyValue(arg)).join(', '),
      };
    }
  }

  get(): any {
    return getValue(this as DerivedSignal<any, any[]>);
  }

  addListener(listener: (value: unknown) => void) {
    addListener(this as WatcherSignal<unknown>, listener);
  }
}

let ID = 0;

export function createDerivedSignal<Type extends DerivedSignalType, T, Args extends unknown[]>(
  type: Type,
  compute: TypeToSignal<T, Args>[Type]['compute'],
  args: Args,
  key?: SignalId,
  scope?: SignalScope,
  opts?: Partial<SignalOptionsWithInit<T, Args>>,
): TypeToSignal<T, Args>[Type] {
  return new DerivedSignalImpl(type, compute, args, key, scope, opts) as unknown as TypeToSignal<T, Args>[Type];
}
