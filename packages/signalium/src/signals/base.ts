import WeakRef from '../weakref.js';
import { TRACER as TRACER, TracerEventType, TracerMeta, VisualizerNodeType } from '../trace.js';
import {
  AsyncResult,
  AsyncTask,
  SignalEquals,
  SignalOptionsWithInit,
  SignalSubscription,
  SubscriptionState,
} from '../types.js';
import { getUnknownSignalFnName, hashValue, stringifyValue } from '../utils.js';
import { createSubscriptionState } from './subscription.js';
import { createAsyncResult, createAsyncTask } from './async.js';
import { FN_CONTEXT_MASKS, SignalScope } from './contexts.js';

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
  Computed,
  Subscription,
  AsyncComputed,
  AsyncTask,
  Watcher,
}

export interface Link {
  dep: ComputedSignal<any, any>;
  sub: WeakRef<ComputedSignal<any, any>>;
  ord: number;
  updatedAt: number;
  consumedAt: number;

  nextDirty: Link | undefined;
}

interface BaseComputedSignal<T> {
  readonly id: SignalId;
  readonly type: SignalType;

  owner: SignalScope;
  deps: Map<ComputedSignal<any, any>, Link>;
  subs: Set<Link>;
  ref: WeakRef<ComputedSignal<any, any>>;

  dirtyState: Link | boolean;
  updatedAt: number;
  contextMask: bigint;

  connectedCount: number;
  equals: SignalEquals<T>;

  tracerMeta?: TracerMeta;
}

export interface StandardComputedSignal<T, Args extends unknown[]> extends BaseComputedSignal<T> {
  type: SignalType.Computed;
  currentValue: T | undefined;
  compute: (...args: Args) => T;
  state: undefined;
  args: Args;
}

export interface AsyncComputedSignal<T, Args extends unknown[]> extends BaseComputedSignal<T> {
  type: SignalType.AsyncComputed;
  currentValue: AsyncResult<T>;
  compute: (...args: Args) => Promise<T> | T;
  state: Promise<unknown> | undefined;
  args: Args;
}

export interface AsyncTaskSignal<T, CreateArgs extends unknown[], RunArgs extends unknown[]>
  extends BaseComputedSignal<T> {
  type: SignalType.AsyncTask;
  currentValue: AsyncTask<T, RunArgs>;
  compute: (...args: [...CreateArgs, ...RunArgs]) => Promise<T> | T;
  state: Promise<unknown> | undefined;
  args: CreateArgs;
}

export interface SubscriptionComputedSignal<T, Args extends unknown[]> extends BaseComputedSignal<T> {
  type: SignalType.Subscription;
  currentValue: T | undefined;
  compute: (state: SubscriptionState<T>, ...args: Args) => SignalSubscription | (() => unknown) | undefined;
  state: SignalSubscription | (() => unknown) | undefined;
  args: [SubscriptionState<T>, ...Args];
}

export interface WatcherSignal<T> extends BaseComputedSignal<T> {
  type: SignalType.Watcher;
  currentValue: T | undefined;
  compute: () => T;
  state: ((value: T) => void)[];
  args: [];
}

export interface TypeToSignal<T, Args extends unknown[]> {
  [SignalType.Computed]: StandardComputedSignal<T, Args>;
  [SignalType.AsyncComputed]: AsyncComputedSignal<T, Args>;
  [SignalType.AsyncTask]: AsyncTaskSignal<T, Args, unknown[]>;
  [SignalType.Subscription]: SubscriptionComputedSignal<T, Args>;
  [SignalType.Watcher]: WatcherSignal<T>;
}

export type ComputedSignal<T, Args extends unknown[]> = TypeToSignal<T, Args>[SignalType];

export function createComputedSignal<Type extends SignalType, T, Args extends unknown[]>(
  type: Type,
  key: SignalId,
  compute: TypeToSignal<T, Args>[Type]['compute'],
  args: Args,
  owner: SignalScope,
  opts?: Partial<SignalOptionsWithInit<T, Args>>,
): TypeToSignal<T, Args>[Type] {
  const signal: ComputedSignal<T, Args> = {
    id: key,
    type,
    owner,

    deps: new Map(),
    subs: new Set(),

    dirtyState: true,
    updatedAt: -1,
    contextMask: FN_CONTEXT_MASKS.get(compute) ?? 0n,
    compute,
    args,
    connectedCount: 0,
    equals: opts?.equals === false ? FALSE_EQUALS : (opts?.equals ?? ((a, b) => a === b)),

    state: type === SignalType.Watcher ? [] : undefined,

    tracerMeta: TRACER
      ? {
          desc: opts?.desc ?? compute.name ?? getUnknownSignalFnName(type, compute),
          params: args.map(arg => stringifyValue(arg)).join(', '),
        }
      : undefined,

    currentValue: opts?.initValue,

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    ref: undefined,
  };

  // Each of these assignments requires the signal reference, which is why they
  // are assigned _after_ the object has been created.
  signal.ref = new WeakRef(signal);

  if (type === SignalType.Subscription) {
    signal.args = [createSubscriptionState(signal), ...args];
  }

  if (type === SignalType.AsyncComputed) {
    signal.currentValue = createAsyncResult(signal as AsyncComputedSignal<T, Args>, opts?.initValue);
  }

  if (type === SignalType.AsyncTask) {
    signal.currentValue = createAsyncTask(signal as AsyncTaskSignal<T, Args, unknown[]>, opts?.initValue);
  }

  return signal as TypeToSignal<T, Args>[Type];
}
