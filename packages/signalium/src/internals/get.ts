import { scheduleListeners, scheduleTracer, scheduleUnwatch, setResolved } from './scheduling.js';
import { SignalType, TRACER as TRACER, TracerEventType } from '../trace.js';
import { ReactiveFnSignal, ReactiveFnFlags, ReactiveFnState } from './reactive.js';
import { createEdge, Edge, EdgeType } from './edge.js';
import { watchSignal } from './watch.js';
import { AsyncSignalImpl } from './async.js';
import { SignalValue } from '../types.js';
import { isGeneratorResult, isPromise, isAsyncSignalImpl } from './utils/type-utils.js';
import { CURRENT_CONSUMER, setCurrentConsumer } from './consumer.js';

export function getSignal<T, Args extends unknown[]>(signal: ReactiveFnSignal<T, Args>): SignalValue<T> {
  if (CURRENT_CONSUMER !== undefined) {
    const { ref, computedCount, deps } = CURRENT_CONSUMER;
    const prevEdge = deps.get(signal);

    const prevConsumedAt = prevEdge?.consumedAt;

    if (prevConsumedAt !== computedCount) {
      if (prevEdge === undefined) {
        TRACER?.emit({
          type: TracerEventType.Connected,
          id: CURRENT_CONSUMER.tracerMeta!.id,
          childId: signal.tracerMeta!.id,
          name: signal.tracerMeta!.desc,
          params: signal.tracerMeta!.params,
          nodeType: SignalType.Reactive,
        });

        if (CURRENT_CONSUMER.watchCount > 0) {
          watchSignal(signal);
        }
      }

      const updatedAt = checkSignal(signal);
      const newEdge = createEdge(prevEdge, EdgeType.Signal, signal, updatedAt, computedCount);

      signal.subs.set(ref, newEdge);
      deps.set(signal, newEdge);
    }
  } else {
    checkSignal(signal);
  }

  return signal._value as SignalValue<T>;
}

export function checkSignal(signal: ReactiveFnSignal<any, any>): number {
  let { ref, _state: state } = signal;

  if (state < ReactiveFnState.Dirty) {
    return signal.updatedCount;
  }

  if (state === ReactiveFnState.MaybeDirty) {
    let edge: Edge | undefined = signal.dirtyHead;

    while (edge !== undefined) {
      if (edge.type === EdgeType.Promise) {
        const dep = edge.dep;

        // If the dependency is pending, then we need to propagate the pending state to the
        // parent signal, and we halt the computation here.
        if (dep.isPending) {
          const value = signal._value;

          if (value instanceof AsyncSignalImpl) {
            // Propagate the pending state to the parent signal
            value._setPending();
          }

          // Add the signal to the awaitSubs map to be notified when the promise is resolved
          dep._awaitSubs.set(ref, edge);

          state = ReactiveFnState.Pending;
          signal.dirtyHead = edge;

          // Early return to prevent the signal from being computed and to preserve the dirty state
          return signal.updatedCount;
        }

        edge = edge.nextDirty;
        continue;
      }

      const dep = edge.dep;
      const updatedAt = checkSignal(dep);

      dep.subs.set(ref, edge);

      if (edge.updatedAt !== updatedAt) {
        signal.dirtyHead = edge.nextDirty;
        state = ReactiveFnState.Dirty;
        break;
      }

      edge = edge.nextDirty;
    }
  }

  if (state === ReactiveFnState.Dirty) {
    if (signal._isLazy) {
      signal.updatedCount++;
    } else {
      runSignal(signal);
    }
  }

  signal._state = ReactiveFnState.Clean;
  signal.dirtyHead = undefined;

  if (TRACER !== undefined && signal.tracerMeta?.tracer) {
    scheduleTracer(signal.tracerMeta.tracer);
  }

  return signal.updatedCount;
}

export function runSignal(signal: ReactiveFnSignal<any, any[]>) {
  TRACER?.emit({
    type: TracerEventType.StartUpdate,
    id: signal.tracerMeta!.id,
  });

  const prevConsumer = CURRENT_CONSUMER;

  const updatedCount = signal.updatedCount;
  const computedCount = ++signal.computedCount;

  try {
    setCurrentConsumer(signal);

    const initialized = updatedCount !== 0;
    const prevValue = signal._value;
    let nextValue = signal.def.compute(...signal.args);
    let valueIsPromise = false;

    if (nextValue !== null && typeof nextValue === 'object') {
      if (isGeneratorResult(nextValue)) {
        nextValue = generatorResultToPromise(nextValue, signal);
        valueIsPromise = true;
      } else if (isPromise(nextValue)) {
        valueIsPromise = true;
      }
    }

    if (valueIsPromise) {
      if (TRACER !== undefined) {
        TRACER.emit({
          type: TracerEventType.StartLoading,
          id: signal.tracerMeta!.id,
        });

        nextValue.finally(() => {
          TRACER!.emit({
            type: TracerEventType.EndLoading,
            id: signal.tracerMeta!.id,
            value: signal._value,
          });
        });
      }

      TRACER?.emit({
        type: TracerEventType.StartLoading,
        id: signal.tracerMeta!.id,
      });

      if (prevValue !== null && typeof prevValue === 'object' && isAsyncSignalImpl(prevValue)) {
        // Update the AsyncSignal with the new promise. Since the value
        // returned from the function is the same AsyncSignal instance,
        // we don't need to increment the updatedCount, because the returned
        // value is the same. _setPromise will update the nested values on the
        // AsyncSignal instance, and consumers of those values will be notified
        // of the change through that.
        prevValue._setPromise(nextValue);
      } else {
        // If the signal has not been computed yet, we then the initValue was assigned
        // in the constructor. Otherwise, we don't know what the initial value was, so
        // we don't pass it to the AsyncSignal constructor.
        const initValue = !initialized ? prevValue : undefined;
        signal._value = AsyncSignalImpl.createPromise(nextValue, signal, initValue);
        signal.updatedCount = updatedCount + 1;
      }
    } else if (!initialized || !signal.def.equals(prevValue!, nextValue)) {
      signal._value = nextValue;
      // If the signal is lazy, we don't want to increment the updatedCount, it
      // has already been updated
      signal.updatedCount = signal._isLazy ? updatedCount : updatedCount + 1;
    }
  } finally {
    setCurrentConsumer(prevConsumer);

    TRACER?.emit({
      type: TracerEventType.EndUpdate,
      id: signal.tracerMeta!.id,
      value: signal._value,
    });

    const { ref, deps } = signal;

    for (const [dep, edge] of deps) {
      if (edge.consumedAt !== computedCount) {
        scheduleUnwatch(dep);
        dep.subs.delete(ref);
        deps.delete(dep);

        TRACER?.emit({
          type: TracerEventType.Disconnected,
          id: signal.tracerMeta!.id,
          childId: dep.tracerMeta!.id,
        });
      }
    }
  }
}

export function checkAndRunListeners(signal: ReactiveFnSignal<any, any>, willWatch = false) {
  const listeners = signal.listeners;

  if (willWatch && (listeners === null || listeners.current.size === 0)) {
    signal.watchCount++;
    signal['flags'] |= ReactiveFnFlags.isListener;
  }

  let updatedCount = checkSignal(signal);

  if (listeners !== null && listeners.updatedAt !== updatedCount) {
    listeners.updatedAt = updatedCount;

    scheduleListeners(signal);
  }

  return updatedCount;
}

export function callback<T, Args extends unknown[]>(fn: (...args: Args) => T): (...args: Args) => T {
  const savedConsumer = CURRENT_CONSUMER;

  return (...args) => {
    const prevConsumer = CURRENT_CONSUMER;
    setCurrentConsumer(savedConsumer);

    try {
      const result = fn(...args);

      if (result !== null && typeof result === 'object' && isGeneratorResult(result)) {
        return generatorResultToPromise(result, savedConsumer) as T;
      }

      return result;
    } finally {
      setCurrentConsumer(prevConsumer);
    }
  };
}

export function generatorResultToPromise<T, Args extends unknown[]>(
  generator: Generator<any, T>,
  savedConsumer: ReactiveFnSignal<any, any> | undefined,
): Promise<T> {
  function adopt(value: any) {
    return typeof value === 'object' && value !== null && (isPromise(value) || isAsyncSignalImpl(value))
      ? value
      : Promise.resolve(value);
  }

  return new Promise((resolve, reject) => {
    function step(result: any) {
      if (result.done) {
        resolve(result.value);
      } else {
        adopt(result.value).then(fulfilled, rejected);
      }
    }

    function fulfilled(value: any) {
      const prevConsumer = CURRENT_CONSUMER;

      try {
        setCurrentConsumer(savedConsumer);
        step(generator.next(value));
      } catch (e) {
        reject(e);
      } finally {
        setCurrentConsumer(prevConsumer);
      }
    }

    function rejected(value: any) {
      const prevConsumer = CURRENT_CONSUMER;

      try {
        setCurrentConsumer(savedConsumer);
        step(generator['throw'](value));
      } catch (e) {
        reject(e);
      } finally {
        setCurrentConsumer(prevConsumer);
      }
    }

    step(generator.next());
  });
}
