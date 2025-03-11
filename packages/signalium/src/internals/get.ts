import { scheduleDisconnect } from './scheduling.js';
import { TRACER as TRACER, TracerEventType } from '../trace.js';
import { AsyncResult, AsyncTask } from '../types.js';
import {
  DerivedSignal,
  Link,
  SignalType,
  ComputedSignal,
  TypeToSignal,
  AsyncComputedSignal,
  AsyncTaskSignal,
  SubscriptionSignal,
} from './base.js';
import { STATE_CLOCK } from './clock.js';
import { CURRENT_CONSUMER, setCurrentConsumer } from './consumer.js';
import { runSubscription } from './subscription.js';
import { runWatcher } from './watcher.js';
import { AsyncValueImpl } from './async.old.js';

let CURRENT_ORD = 0;

export function getValue<T, Args extends unknown[]>(
  signal: DerivedSignal<T, Args>,
): T | AsyncResult<T> | AsyncTask<T, unknown[]> {
  if (CURRENT_CONSUMER !== undefined) {
    const { deps, connectedCount } = CURRENT_CONSUMER;
    const prevLink = deps.get(signal);

    if (prevLink === undefined) {
      TRACER?.emit({
        type: TracerEventType.Connected,
        id: CURRENT_CONSUMER.tracerMeta!.id,
        childId: signal.tracerMeta!.id,
        name: signal.tracerMeta!.desc,
        params: signal.tracerMeta!.params,
        nodeType: signal.type,
      });
    }

    const ord = CURRENT_ORD++;

    checkSignal(signal, !prevLink && connectedCount > 0);

    if (prevLink === undefined) {
      const newLink = {
        dep: signal,
        sub: CURRENT_CONSUMER.ref,
        ord,
        updatedAt: signal.updatedAt,
        consumedAt: STATE_CLOCK,
        nextDirty: undefined,
      };

      deps.set(signal, newLink);
      signal.subs.add(newLink);
    } else if (prevLink.consumedAt !== STATE_CLOCK) {
      prevLink.ord = ord;
      prevLink.updatedAt = signal.updatedAt;
      prevLink.consumedAt = STATE_CLOCK;
      signal.subs.add(prevLink);
    }
  } else {
    checkSignal(signal);
  }

  return signal.currentValue!;
}

export function checkSignal(
  signal: DerivedSignal<any, any>,
  shouldWatch = false,
  connectCount = 1,
  immediate = false,
): number {
  let dirtyState = signal.dirtyState;
  let connectedCount = signal.connectedCount;

  const wasConnected = connectedCount > 0;
  const shouldConnect = shouldWatch && !wasConnected;

  if (shouldWatch) {
    signal.connectedCount = connectedCount = connectedCount + connectCount;
  }

  if (shouldConnect) {
    if (signal.type === SignalType.Subscription) {
      dirtyState = true;
    } else {
      for (const [dep, link] of signal.deps) {
        if (link.updatedAt !== checkSignal(dep, true)) {
          dirtyState = true;
          break;
        }
      }
    }
  }

  if (dirtyState === false) {
    return signal.updatedAt;
  } else if (dirtyState !== true) {
    let link: Link | undefined = dirtyState;

    while (link !== undefined) {
      const dep = link.dep;

      if (link.updatedAt !== checkSignal(dep, true)) {
        dirtyState = true;
        break;
      }

      link = link.nextDirty;
    }
  }

  if (dirtyState === true) {
    runSignal(signal, wasConnected, shouldConnect, immediate);
  } else {
    let link = signal.dirtyState as Link | undefined;

    while (link !== undefined) {
      link.dep.subs.add(link);

      let nextDirty = link.nextDirty;
      link.nextDirty = undefined;
      link = nextDirty;
    }
  }

  signal.dirtyState = false;

  return signal.updatedAt;
}

function runSignal<T, Args extends unknown[]>(
  signal: DerivedSignal<T, Args>,
  wasConnected: boolean,
  shouldConnect: boolean,
  immediate = false,
) {
  TRACER?.emit({
    type: TracerEventType.StartUpdate,
    id: signal.tracerMeta!.id,
  });

  const { type, compute } = signal;

  const prevConsumer = CURRENT_CONSUMER;

  const initialized = signal.updatedAt !== -1;

  try {
    setCurrentConsumer(signal);

    switch (type) {
      case SignalType.Computed: {
        const prevValue = signal.currentValue;
        const nextValue = compute(...signal.args);

        if (!initialized || !signal.equals(prevValue!, nextValue)) {
          signal.currentValue = nextValue;
          signal.updatedAt = STATE_CLOCK;
        }

        break;
      }

      case SignalType.AsyncComputed: {
        (signal.currentValue as AsyncValueImpl<T, Args, unknown[], unknown[]>).run();
        break;
      }

      case SignalType.Subscription: {
        runSubscription(signal, shouldConnect);
        break;
      }

      case SignalType.AsyncTask: {
        break;
      }

      default: {
        runWatcher(signal, initialized, immediate);
        break;
      }
    }
  } finally {
    TRACER?.emit({
      type: TracerEventType.EndUpdate,
      id: signal.tracerMeta!.id,
      value: signal.currentValue,
    });

    const { deps } = signal;

    for (const link of deps.values()) {
      if (link.consumedAt === STATE_CLOCK) continue;

      const dep = link.dep;

      if (wasConnected) {
        scheduleDisconnect(dep);
      }

      TRACER?.emit({
        type: TracerEventType.Disconnected,
        id: signal.tracerMeta!.id,
        childId: dep.tracerMeta!.id,
      });

      deps.delete(dep);
      dep.subs.delete(link);
    }

    setCurrentConsumer(prevConsumer);
  }
}

export function disconnectSignal(signal: DerivedSignal<any, any>, count = 1) {
  signal.connectedCount -= count;

  if (signal.connectedCount > 0) {
    return;
  } else if (signal.connectedCount < 0) {
    throw new Error('Signal disconnect count cannot be negative');
  }

  if (signal.type === SignalType.Subscription) {
    const subscription = signal.state;

    if (typeof subscription === 'function') {
      subscription();
    } else if (subscription !== undefined) {
      subscription.unsubscribe?.();
    }
  }

  for (const link of signal.deps.values()) {
    const dep = link.dep;

    disconnectSignal(dep);
  }
}
