import { ComputedSignal } from './signals';
import { scheduleWatchers, scheduleDisconnects } from './config';

const PENDING_WATCHERS: ComputedSignal<any>[] = [];
const PENDING_DISCONNECTS: Map<ComputedSignal<any>, number> = new Map();

export const scheduleWatcher = (watcher: ComputedSignal<any>) => {
  PENDING_WATCHERS.push(watcher);

  scheduleWatchers(flushWatchers);
};

const flushWatchers = async () => {
  let watcher;
  while ((watcher = PENDING_WATCHERS.shift())) {
    watcher._check();
  }

  PENDING_WATCHERS.length = 0;
};

export const scheduleDisconnect = (disconnect: ComputedSignal<any>) => {
  const current = PENDING_DISCONNECTS.get(disconnect) ?? 0;

  PENDING_DISCONNECTS.set(disconnect, current + 1);

  scheduleDisconnects(flushDisconnects);
};

const flushDisconnects = async () => {
  for (const [signal, count] of PENDING_DISCONNECTS) {
    signal._disconnect(count);
  }
};
