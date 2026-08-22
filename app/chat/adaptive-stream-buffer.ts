export const STREAM_FLUSH_INTERVAL_MS = {
  normal: 48,
  busy: 32,
} as const;

export const STREAM_BUSY_THRESHOLD = 96;
export const STREAM_CATCH_UP_THRESHOLD = 480;

export const STREAM_BATCH_SIZE = {
  normal: 16,
  busy: 32,
  catchUp: 64,
} as const;

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

export type StreamBufferScheduler = {
  setTimeout: (callback: () => void, delay: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
};

export type AdaptiveStreamBuffer = {
  push: (delta: string) => void;
  flush: () => void;
  reset: () => void;
  dispose: () => void;
};

const defaultScheduler: StreamBufferScheduler = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

export function createAdaptiveStreamBuffer(
  onFlush: (batch: string) => void,
  scheduler: StreamBufferScheduler = defaultScheduler,
): AdaptiveStreamBuffer {
  let pending = "";
  let timer: TimerHandle | null = null;
  let scheduledDelay = 0;

  function cancelScheduledFlush() {
    if (timer === null) return;
    scheduler.clearTimeout(timer);
    timer = null;
    scheduledDelay = 0;
  }

  function streamProfile() {
    if (pending.length >= STREAM_CATCH_UP_THRESHOLD) {
      return {
        delay: STREAM_FLUSH_INTERVAL_MS.busy,
        batchSize: STREAM_BATCH_SIZE.catchUp,
      };
    }
    if (pending.length >= STREAM_BUSY_THRESHOLD) {
      return {
        delay: STREAM_FLUSH_INTERVAL_MS.busy,
        batchSize: STREAM_BATCH_SIZE.busy,
      };
    }
    return {
      delay: STREAM_FLUSH_INTERVAL_MS.normal,
      batchSize: STREAM_BATCH_SIZE.normal,
    };
  }

  function takeNextBatch(batchSize: number) {
    let end = Math.min(batchSize, pending.length);
    const finalCodeUnit = pending.charCodeAt(end - 1);
    if (end < pending.length && finalCodeUnit >= 0xD800 && finalCodeUnit <= 0xDBFF) end += 1;
    const batch = pending.slice(0, end);
    pending = pending.slice(end);
    return batch;
  }

  function scheduleFlush() {
    const { delay } = streamProfile();
    if (timer !== null) {
      if (delay >= scheduledDelay) return;
      cancelScheduledFlush();
    }

    scheduledDelay = delay;
    timer = scheduler.setTimeout(() => {
      timer = null;
      scheduledDelay = 0;
      const { batchSize } = streamProfile();
      const batch = takeNextBatch(batchSize);
      if (batch) onFlush(batch);
      if (pending) scheduleFlush();
    }, delay);
  }

  return {
    push(delta) {
      if (!delta) return;
      pending += delta;
      scheduleFlush();
    },
    flush() {
      cancelScheduledFlush();
      const batch = pending;
      pending = "";
      if (batch) onFlush(batch);
    },
    reset() {
      cancelScheduledFlush();
      pending = "";
    },
    dispose() {
      cancelScheduledFlush();
      pending = "";
    },
  };
}
