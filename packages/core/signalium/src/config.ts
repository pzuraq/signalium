let currentFlush: ReturnType<typeof setTimeout> | null = null;

export type FlushCallback = () => Promise<void>;

export type FlushFn = (fn: () => Promise<void>) => void;

export let scheduleFlush: FlushFn = flushWatchers => {
  if (currentFlush !== null) return;

  currentFlush = setTimeout(() => {
    currentFlush = null;

    flushWatchers();
  }, 0);
};

export const setScheduleFlush = (flushFn: FlushFn) => {
  scheduleFlush = flushFn;
};

export type BatchFn = (fn: () => void) => void;

export let runBatch: BatchFn = fn => fn();

export const setRunBatch = (batchFn: BatchFn) => {
  runBatch = batchFn;
};
