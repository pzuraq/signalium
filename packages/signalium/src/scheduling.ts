import { ComputedSignal } from './signals';
import { scheduleWatchers, scheduleDisconnects } from './config';

let PENDING_FLUSH_WATCHERS: {
  promise: Promise<void>;
  resolve: () => void;
} | null = null;

const PENDING_WATCHERS: ComputedSignal<any>[] = [];
const PENDING_DISCONNECTS: Map<ComputedSignal<any>, number> = new Map();

export const scheduleWatcher = (watcher: ComputedSignal<any>) => {
  PENDING_WATCHERS.push(watcher);

  if (PENDING_FLUSH_WATCHERS === null) {
    let resolve: () => void;

    const promise = new Promise<void>((r) => {
      resolve = r;
    });

    PENDING_FLUSH_WATCHERS = { promise, resolve: resolve! };
  }

  scheduleWatchers(flushWatchers);
};

const flushWatchers = async () => {
  PENDING_FLUSH_WATCHERS!.resolve();
  PENDING_FLUSH_WATCHERS = null;
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
  await PENDING_FLUSH_WATCHERS?.promise;
  for (const [signal, count] of PENDING_DISCONNECTS) {
    signal._disconnect(count);
  }

  PENDING_DISCONNECTS.clear();
};
