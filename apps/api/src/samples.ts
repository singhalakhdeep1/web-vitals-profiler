/** Reading stored vitals samples (collection "vitals"). */
import type { Metric, Sample } from "@wvp/core";
import type { VitalsDoc } from "@wvp/firebase";
import type { Deps } from "./deps";

export const DAY = 86_400_000;
export const RANGES: Record<string, number> = { "1d": 1, "7d": 7, "28d": 28, "30d": 30, "90d": 90 };
const MAX_ROWS = 20_000;

export const toSample = (d: VitalsDoc): Sample => ({ name: d.name as Metric, value: d.value, timestamp: d.timestamp, url: d.url, device: d.device, browser: d.browser, connection: d.connection, country: d.country });

/** A user's samples since `days` ago, optionally for one URL. */
export async function samplesFor(deps: Deps, userId: string, days: number, url?: string): Promise<VitalsDoc[]> {
  const since = Date.now() - days * DAY;
  return deps.store.query<VitalsDoc>("vitals", {
    where: url ? [["userId", "==", userId], ["url", "==", url], ["timestamp", ">=", since]] : [["userId", "==", userId], ["timestamp", ">=", since]],
    orderBy: ["timestamp", "desc"],
    limit: MAX_ROWS,
  });
}

/** Samples of one URL from several users (team dashboards, A/B tests) in a time window. */
export async function samplesForUrl(deps: Deps, url: string, since: number, userIds?: string[], until = Date.now()): Promise<VitalsDoc[]> {
  const rows = await deps.store.query<VitalsDoc>("vitals", { where: [["url", "==", url], ["timestamp", ">=", since]], orderBy: ["timestamp", "desc"], limit: MAX_ROWS });
  const allowed = userIds ? new Set(userIds) : null;
  return rows.filter((r) => r.timestamp <= until && (!allowed || allowed.has(r.userId)));
}

/** Drops cached aggregates of a user after new samples arrive. */
export const invalidateUser = (deps: Deps, userId: string): Promise<number> => deps.cache.invalidatePattern(`agg:${userId}:*`);
