/**
 * The document store the API persists to. Two implementations:
 *  - FirestoreStore: Google Cloud Firestore through firebase-admin (or the Firestore emulator via FIRESTORE_EMULATOR_HOST)
 *  - MemoryStore: in-process, for local development without a Firebase project
 * Queries are deliberately simple (equality / range filters, one order, a limit) so both behave the same.
 */

export type Op = "==" | "<" | "<=" | ">" | ">=" | "array-contains" | "in";
export type Where = [field: string, op: Op, value: unknown];

export interface Query {
  where?: Where[];
  orderBy?: [field: string, direction: "asc" | "desc"];
  limit?: number;
}

export interface DocStore {
  readonly kind: "firestore" | "memory";
  get<T>(collection: string, id: string): Promise<T | null>;
  /** Creates or replaces the document. */
  set<T extends object>(collection: string, id: string, doc: T): Promise<void>;
  /** Merges fields into an existing document. */
  update(collection: string, id: string, patch: Record<string, unknown>): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  query<T>(collection: string, q?: Query): Promise<T[]>;
  /** Writes many documents (in chunks of 500 on Firestore). */
  setMany<T extends object>(collection: string, docs: { id: string; doc: T }[]): Promise<void>;
  ping(): Promise<void>;
}

const get = (doc: Record<string, unknown>, field: string): unknown => field.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], doc);

function matches(doc: Record<string, unknown>, [field, op, value]: Where): boolean {
  const v = get(doc, field) as never;
  switch (op) {
    case "==":
      return v === value;
    case "<":
      return v < (value as never);
    case "<=":
      return v <= (value as never);
    case ">":
      return v > (value as never);
    case ">=":
      return v >= (value as never);
    case "array-contains":
      return Array.isArray(v) && (v as unknown[]).includes(value);
    case "in":
      return Array.isArray(value) && value.includes(v);
  }
}

export class MemoryStore implements DocStore {
  readonly kind = "memory" as const;
  private readonly data = new Map<string, Map<string, Record<string, unknown>>>();

  private col(name: string): Map<string, Record<string, unknown>> {
    let c = this.data.get(name);
    if (!c) this.data.set(name, (c = new Map()));
    return c;
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    const doc = this.col(collection).get(id);
    return doc ? (structuredClone(doc) as T) : null;
  }

  async set<T extends object>(collection: string, id: string, doc: T): Promise<void> {
    this.col(collection).set(id, structuredClone(doc) as Record<string, unknown>);
  }

  async update(collection: string, id: string, patch: Record<string, unknown>): Promise<void> {
    const existing = this.col(collection).get(id);
    if (!existing) throw new Error(`No document ${collection}/${id}`);
    this.col(collection).set(id, { ...existing, ...structuredClone(patch) });
  }

  async delete(collection: string, id: string): Promise<void> {
    this.col(collection).delete(id);
  }

  async query<T>(collection: string, q: Query = {}): Promise<T[]> {
    let rows = [...this.col(collection).values()].filter((d) => (q.where ?? []).every((w) => matches(d, w)));
    if (q.orderBy) {
      const [field, dir] = q.orderBy;
      rows.sort((a, b) => {
        const x = get(a, field) as never;
        const y = get(b, field) as never;
        return (x < y ? -1 : x > y ? 1 : 0) * (dir === "desc" ? -1 : 1);
      });
    }
    if (q.limit !== undefined) rows = rows.slice(0, q.limit);
    return structuredClone(rows) as T[];
  }

  async setMany<T extends object>(collection: string, docs: { id: string; doc: T }[]): Promise<void> {
    for (const { id, doc } of docs) await this.set(collection, id, doc);
  }

  async ping(): Promise<void> {}
}
