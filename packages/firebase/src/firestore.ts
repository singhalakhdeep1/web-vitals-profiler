/**
 * Firestore implementation of the document store (firebase-admin). Credentials come from FIREBASE_SERVICE_ACCOUNT
 * (the service-account JSON), GOOGLE_APPLICATION_CREDENTIALS, or the emulator when FIRESTORE_EMULATOR_HOST is set.
 * Composite indexes needed by the API's queries are declared in firestore.indexes.json at the repository root.
 */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore, type Query as FsQuery } from "firebase-admin/firestore";
import type { DocStore, Query } from "./store";

export interface FirebaseConfig {
  projectId?: string;
  /** Service-account JSON (as a string). */
  serviceAccount?: string;
}

export function firebaseConfigFromEnv(env: Record<string, string | undefined> = process.env): FirebaseConfig | null {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId && !env.FIREBASE_SERVICE_ACCOUNT) return null;
  return { projectId, serviceAccount: env.FIREBASE_SERVICE_ACCOUNT };
}

function app(config: FirebaseConfig): App {
  const existing = getApps().find((a) => a.name === "wvp");
  if (existing) return existing;
  const credential = config.serviceAccount ? cert(JSON.parse(config.serviceAccount) as Record<string, string>) : undefined;
  return initializeApp({ projectId: config.projectId, ...(credential && { credential }) }, "wvp");
}

export class FirestoreStore implements DocStore {
  readonly kind = "firestore" as const;
  readonly db: Firestore;

  constructor(config: FirebaseConfig) {
    this.db = getFirestore(app(config));
    // documents carry optional fields; skipping undefined keeps them writable
    this.db.settings({ ignoreUndefinedProperties: true });
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    const snap = await this.db.collection(collection).doc(id).get();
    return snap.exists ? (snap.data() as T) : null;
  }

  async set<T extends object>(collection: string, id: string, doc: T): Promise<void> {
    await this.db.collection(collection).doc(id).set(doc as Record<string, unknown>);
  }

  async update(collection: string, id: string, patch: Record<string, unknown>): Promise<void> {
    await this.db.collection(collection).doc(id).update(patch);
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.db.collection(collection).doc(id).delete();
  }

  async query<T>(collection: string, q: Query = {}): Promise<T[]> {
    let ref: FsQuery = this.db.collection(collection);
    for (const [field, op, value] of q.where ?? []) ref = ref.where(field, op, value);
    if (q.orderBy) ref = ref.orderBy(q.orderBy[0], q.orderBy[1]);
    if (q.limit !== undefined) ref = ref.limit(q.limit);
    const snap = await ref.get();
    return snap.docs.map((d) => d.data() as T);
  }

  async setMany<T extends object>(collection: string, docs: { id: string; doc: T }[]): Promise<void> {
    for (let i = 0; i < docs.length; i += 500) {
      const batch = this.db.batch();
      for (const { id, doc } of docs.slice(i, i + 500)) batch.set(this.db.collection(collection).doc(id), doc as Record<string, unknown>);
      await batch.commit();
    }
  }

  async ping(): Promise<void> {
    await this.db.collection("_health").limit(1).get();
  }
}
