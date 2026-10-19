// Service-worker helpers for web vitals profiler: background sync with offline support.
// Measured vitals are queued in chrome.storage.local (they survive the worker being stopped, the browser closing and
// the network being down) and flushed to the sync server in batches; failed flushes back off exponentially and are
// retried by a chrome.alarms schedule.

export interface QueueState<T> {
  items: T[];
  failures: number;
  nextAttemptAt: number;
  lastError?: string;
  lastFlushAt?: number;
}

export interface UploadQueueOptions<T> {
  storageKey: string;
  /** Sends one batch; throws to keep the items queued. */
  send: (batch: T[]) => Promise<void>;
  batchSize?: number;
  /** Oldest items are dropped beyond this (a long offline period must not fill the storage quota). */
  maxItems?: number;
  /** Errors whose retry is pointless (e.g. signed out): the queue waits for the next explicit flush. */
  isPermanent?: (error: unknown) => boolean;
}

const BACKOFF_MAX_MS = 30 * 60_000;

export class UploadQueue<T> {
  private running: Promise<{ sent: number; remaining: number }> | null = null;
  /** Every read-modify-write of the stored queue runs after the previous one (metrics arrive concurrently). */
  private lock: Promise<unknown> = Promise.resolve();

  private exclusive<R>(fn: () => Promise<R>): Promise<R> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }
  private readonly batchSize: number;
  private readonly maxItems: number;

  constructor(private readonly options: UploadQueueOptions<T>) {
    this.batchSize = options.batchSize ?? 200;
    this.maxItems = options.maxItems ?? 5000;
  }

  async state(): Promise<QueueState<T>> {
    const stored = (await chrome.storage.local.get(this.options.storageKey))[this.options.storageKey] as QueueState<T> | undefined;
    return stored ?? { items: [], failures: 0, nextAttemptAt: 0 };
  }

  private async save(state: QueueState<T>): Promise<void> {
    await chrome.storage.local.set({ [this.options.storageKey]: state });
  }

  async size(): Promise<number> {
    return (await this.state()).items.length;
  }

  enqueue(items: T[]): Promise<void> {
    if (!items.length) return Promise.resolve();
    return this.exclusive(async () => {
      const state = await this.state();
      state.items.push(...items);
      if (state.items.length > this.maxItems) state.items.splice(0, state.items.length - this.maxItems);
      await this.save(state);
    });
  }

  clear(): Promise<void> {
    return this.exclusive(() => this.save({ items: [], failures: 0, nextAttemptAt: 0 }));
  }

  /** Sends everything queued, batch by batch. `force` ignores the back-off (a user pressed "Sync now"). */
  flush(force = false): Promise<{ sent: number; remaining: number }> {
    this.running ??= this.doFlush(force).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async doFlush(force: boolean): Promise<{ sent: number; remaining: number }> {
    let state = await this.state();
    if (!state.items.length) return { sent: 0, remaining: 0 };
    if (!force && Date.now() < state.nextAttemptAt) return { sent: 0, remaining: state.items.length };
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { sent: 0, remaining: state.items.length };
    let sent = 0;
    while (state.items.length) {
      const batch = state.items.slice(0, this.batchSize);
      try {
        await this.options.send(batch);
      } catch (e) {
        const permanent = this.options.isPermanent?.(e) ?? false;
        await this.exclusive(async () => {
          const fresh = await this.state();
          fresh.failures = state.failures + 1;
          fresh.lastError = (e as Error).message;
          fresh.nextAttemptAt = permanent ? Number.MAX_SAFE_INTEGER : Date.now() + Math.min(BACKOFF_MAX_MS, 2 ** fresh.failures * 15_000);
          await this.save(fresh);
        });
        throw e;
      }
      sent += batch.length;
      // re-read under the lock: items may have been added while the batch was in flight
      state = await this.exclusive(async () => {
        const fresh = await this.state();
        fresh.items.splice(0, batch.length);
        fresh.failures = 0;
        fresh.nextAttemptAt = 0;
        fresh.lastError = undefined;
        fresh.lastFlushAt = Date.now();
        await this.save(fresh);
        return fresh;
      });
    }
    return { sent, remaining: 0 };
  }
}

/** Runs `task` every `periodMinutes` (chrome.alarms keeps firing even after the worker was stopped). */
export function registerBackgroundSync(alarmName: string, periodMinutes: number, task: () => Promise<unknown>): void {
  void chrome.alarms.create(alarmName, { periodInMinutes: periodMinutes });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === alarmName) void task().catch(() => undefined);
  });
}
