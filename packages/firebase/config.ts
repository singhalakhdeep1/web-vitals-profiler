// Firebase configuration for web vitals profiler: the document store (Firestore or in-memory) and the vitals helpers
// the design documents describe (save, query by URL, percentile statistics).

import { summarize } from "@wvp/wasm";
import { FirestoreStore, firebaseConfigFromEnv } from "./src/firestore";
import { MemoryStore, type DocStore } from "./src/store";

export { FirestoreStore, firebaseConfigFromEnv, MemoryStore };
export type { DocStore, Op, Query, Where } from "./src/store";

/** Firestore when FIREBASE_PROJECT_ID / FIREBASE_SERVICE_ACCOUNT is set (or the emulator is), otherwise in-memory. */
export function createStore(env: Record<string, string | undefined> = process.env): DocStore {
  const config = firebaseConfigFromEnv(env);
  return config ? new FirestoreStore(config) : new MemoryStore();
}

/** One stored vitals sample (collection "vitals"). */
export interface VitalsDoc {
  id: string;
  userId: string;
  url: string;
  origin: string;
  name: "LCP" | "CLS" | "INP" | "FCP" | "TTFB" | "TBT";
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  timestamp: number;
  navigationType?: string;
  device?: "desktop" | "mobile" | "tablet";
  browser?: string;
  connection?: string;
  country?: string;
}

export async function saveVitals(store: DocStore, vitals: VitalsDoc[]): Promise<void> {
  await store.setMany("vitals", vitals.map((v) => ({ id: v.id, doc: v })));
}

export async function getVitalsByUrl(store: DocStore, userId: string, url: string, limit = 1000): Promise<VitalsDoc[]> {
  return store.query<VitalsDoc>("vitals", { where: [["userId", "==", userId], ["url", "==", url]], orderBy: ["timestamp", "desc"], limit });
}

/** p50 / p75 / p95 per metric for a URL (percentiles computed in WebAssembly). */
export async function getVitalsStats(store: DocStore, userId: string, url: string): Promise<Record<string, ReturnType<typeof summarize>>> {
  const vitals = await getVitalsByUrl(store, userId, url, 5000);
  const byName = new Map<string, number[]>();
  for (const v of vitals) (byName.get(v.name) ?? byName.set(v.name, []).get(v.name)!).push(v.value);
  return Object.fromEntries([...byName].map(([name, values]) => [name, summarize(values)]));
}
