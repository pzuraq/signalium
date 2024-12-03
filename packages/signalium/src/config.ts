let currentWatcherFlush: number | null = null;
let currentDisconnectFlush: number | null = null;

export type FlushCallback = () => Promise<void>;

const idleCallback =
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 0);

export let scheduleWatchers: (flushWatchers: FlushCallback) => void = (
  flushWatchers
) => {
  if (currentWatcherFlush !== null) return;

  currentWatcherFlush = setTimeout(() => {
    currentWatcherFlush = null;

    flushWatchers();
  }, 0);
};

export let scheduleDisconnects: (flushDisconnects: FlushCallback) => void = (
  flushDisconnects
) => {
  if (currentDisconnectFlush !== null) return;

  currentDisconnectFlush = idleCallback(() => {
    currentDisconnectFlush = null;

    flushDisconnects();
  });
};
