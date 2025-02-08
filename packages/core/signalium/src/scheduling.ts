import { ComputedSignal } from './signals.js';
import { scheduleFlush, runBatch } from './config.js';

let PENDING_DIRTIES: ComputedSignal<any>[] = [];
let PENDING_PULLS: ComputedSignal<any>[] = [];
let PENDING_WATCHERS: ComputedSignal<any>[] = [];
let PENDING_WATCHERS_INIT: ComputedSignal<any>[] = [];
let PENDING_DISCONNECTS = new Map<ComputedSignal<any>, number>();

const microtask = () => Promise.resolve();

export const scheduleWatcher = (watcher: ComputedSignal<any>, isStarting = false) => {
  if (isStarting) {
    PENDING_WATCHERS_INIT.push(watcher);
  } else {
    PENDING_WATCHERS.push(watcher);
  }

  scheduleFlush(flushWatchers);
};

export const scheduleDirty = (signal: ComputedSignal<any>) => {
  PENDING_DIRTIES.push(signal);
  scheduleFlush(flushWatchers);
};

export const schedulePull = (signal: ComputedSignal<any>) => {
  PENDING_PULLS.push(signal);
  scheduleFlush(flushWatchers);
};

export const scheduleDisconnect = (disconnect: ComputedSignal<any>) => {
  const current = PENDING_DISCONNECTS.get(disconnect) ?? 0;

  PENDING_DISCONNECTS.set(disconnect, current + 1);

  scheduleFlush(flushWatchers);
};

const flushWatchers = async () => {
  while (PENDING_DIRTIES.length > 0 || PENDING_PULLS.length > 0) {
    for (const dirty of PENDING_DIRTIES) {
      dirty._dirtyConsumers();
    }

    for (const pull of PENDING_PULLS) {
      pull._check();
    }

    PENDING_DIRTIES = [];
    PENDING_PULLS = [];

    await microtask();
  }

  runBatch(() => {
    for (const watcher of PENDING_WATCHERS) {
      watcher._check();
    }

    for (const watcher of PENDING_WATCHERS_INIT) {
      watcher._check(true);
    }

    for (const [signal, count] of PENDING_DISCONNECTS) {
      signal._disconnect(count);
    }

    PENDING_WATCHERS = [];
    PENDING_WATCHERS_INIT = [];
    PENDING_DISCONNECTS.clear();
  });
};
