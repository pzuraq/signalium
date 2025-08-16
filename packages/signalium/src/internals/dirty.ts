import { scheduleAsyncPull, schedulePull } from './scheduling.js';
import { DerivedSignal, isSubscription, SignalState } from './derived.js';
import { CURRENT_CONSUMER } from './consumer.js';
import { Edge } from './edge.js';

export function dirtySignal(signal: DerivedSignal<any, any>) {
  const prevState = signal._state;

  if (prevState === SignalState.Dirty) {
    return;
  }

  signal._state = SignalState.Dirty;

  if (prevState !== SignalState.MaybeDirty) {
    propagateDirty(signal);
  }
}

function propagateDirty(signal: DerivedSignal<any, any>) {
  if (CURRENT_CONSUMER === signal) {
    throw new Error(
      'A signal was dirtied after it was consumed by the current function. This can cause race conditions and infinite rerenders and is not allowed.',
    );
  }

  if (isSubscription(signal)) {
    if (signal.watchCount > 0) {
      scheduleAsyncPull(signal);
    }

    // else do nothing, only schedule if connected
  } else {
    if (signal._isListener) {
      schedulePull(signal);
    }

    dirtySignalConsumers(signal.subs);
    signal.subs = new Map();
  }
}

export function dirtySignalConsumers(map: Map<WeakRef<DerivedSignal<any, any>>, Edge>) {
  for (const [subRef, edge] of map) {
    const sub = subRef.deref();

    if (sub === undefined || sub.computedCount !== edge.consumedAt) continue;

    const dirtyState = sub._state;

    switch (dirtyState) {
      case SignalState.Clean:
        sub._state = SignalState.MaybeDirty;
        sub.dirtyHead = edge;
        edge.nextDirty = undefined;
        propagateDirty(sub);
        break;

      case SignalState.Pending:
      case SignalState.MaybeDirty: {
        let subEdge = sub.dirtyHead!;
        const ord = edge.ord;

        if (subEdge.ord > ord) {
          sub.dirtyHead = edge;
          edge.nextDirty = subEdge;

          if (dirtyState === SignalState.Pending) {
            // If the signal is pending, the first edge is the halt edge. If the
            // new dirty edge is BEFORE the halt edge, then it means that something
            // changed before the current halt, so we need to cancel the current computation
            // and recompute.
            sub._state = SignalState.MaybeDirty;
            propagateDirty(sub);
          }
        } else {
          let nextDirty = subEdge.nextDirty;

          while (nextDirty !== undefined && nextDirty.ord < ord) {
            subEdge = nextDirty;
            nextDirty = subEdge.nextDirty;
          }

          edge.nextDirty = nextDirty;
          subEdge!.nextDirty = edge;
        }
        break;
      }
    }
  }
}
