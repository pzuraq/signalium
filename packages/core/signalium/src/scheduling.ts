import { ComputedSignal } from './signals.js';
import { scheduleFlush, runBatch } from './config.js';
import { Tracer, TRACER } from './trace.js';

let PENDING_DIRTIES: ComputedSignal<any>[] = [];
let PENDING_PULLS: ComputedSignal<any>[] = [];
let PENDING_WATCHERS: ComputedSignal<any>[] = [];
let PENDING_CONNECTS = new Map<ComputedSignal<any>, number>();
let PENDING_DISCONNECTS = new Map<ComputedSignal<any>, number>();
let PENDING_EFFECTS: ComputedSignal<any>[] = [];
let PENDING_TRACERS: Tracer[] = [];

const microtask = () => Promise.resolve();

export const scheduleWatcher = (watcher: ComputedSignal<any>) => {
  PENDING_WATCHERS.push(watcher);

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

export const scheduleConnect = (connect: ComputedSignal<any>) => {
  const current = PENDING_CONNECTS.get(connect) ?? 0;

  PENDING_CONNECTS.set(connect, current + 1);

  scheduleFlush(flushWatchers);
};

export const scheduleDisconnect = (disconnect: ComputedSignal<any>) => {
  const current = PENDING_DISCONNECTS.get(disconnect) ?? 0;

  PENDING_DISCONNECTS.set(disconnect, current + 1);

  scheduleFlush(flushWatchers);
};

export const scheduleEffect = (signal: ComputedSignal<any>) => {
  PENDING_EFFECTS.push(signal);
  scheduleFlush(flushWatchers);
};

export const scheduleTracer = (tracer: Tracer) => {
  PENDING_TRACERS.push(tracer);
  console.log('scheduleTracer');
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

    for (const [signal, count] of PENDING_CONNECTS) {
      signal._check(true, count);
    }

    for (const [signal, count] of PENDING_DISCONNECTS) {
      signal._disconnect(count);
    }

    for (const signal of PENDING_EFFECTS) {
      signal._runEffects();
    }

    console.log('PENDING_TRACERS', PENDING_TRACERS.length);

    for (const tracer of PENDING_TRACERS) {
      tracer.flush();
    }

    PENDING_WATCHERS = [];
    PENDING_CONNECTS.clear();
    PENDING_DISCONNECTS.clear();
    PENDING_EFFECTS = [];
    PENDING_TRACERS = [];
  });
};
