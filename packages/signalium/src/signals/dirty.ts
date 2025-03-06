import { scheduleWatcher } from '../scheduling.js';
import { ComputedSignal, Link, SignalType } from './base.js';

export function dirtySignal(signal: ComputedSignal<any, any>) {
  if (signal.type === SignalType.Subscription) {
    if (signal.connectedCount > 0) {
      scheduleWatcher(signal);
    }

    // else do nothing, only schedule if connected
  } else if (signal.type === SignalType.Watcher) {
    scheduleWatcher(signal);
  } else {
    dirtySignalConsumers(signal);
  }
}

export function dirtySignalConsumers(signal: ComputedSignal<any, any>, force = false) {
  for (const link of signal.subs.values()) {
    const sub = link.sub.deref();

    if (sub === undefined) continue;

    const dirtyState = sub.dirtyState;

    if (dirtyState === false) {
      sub.dirtyState = force ? true : link;
      link.nextDirty = undefined;
      dirtySignal(sub);
    } else if (dirtyState !== true) {
      if (force) {
        sub.dirtyState = true;
        dirtySignal(sub);
        continue;
      }

      let subLink = dirtyState as Link;
      const ord = link.ord;

      if (subLink.ord > ord) {
        sub.dirtyState = link;
        link.nextDirty = subLink;
      } else {
        let nextDirty = subLink.nextDirty;

        while (nextDirty !== undefined && nextDirty!.ord < ord) {
          subLink = nextDirty;
          nextDirty = subLink.nextDirty;
        }

        link.nextDirty = nextDirty;
        subLink!.nextDirty = link;
      }
    }
  }

  signal.subs = new Set();
}
