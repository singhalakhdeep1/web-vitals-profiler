/**
 * Talks to the sync API from extension pages and the background worker. The server address and the session live in
 * chrome.storage.local under "wvp:sync", so every extension context sees the same sign-in.
 */

export interface SyncUser {
  id: string;
  name: string;
  email: string;
}

export interface SyncSettings {
  apiUrl: string;
  token?: string;
  user?: SyncUser;
  /** Upload measured vitals to the server. */
  enabled: boolean;
  lastSyncAt?: number;
  lastError?: string;
}

export const SYNC_KEY = "wvp:sync";
export const DEFAULT_API_URL = "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function getSyncSettings(): Promise<SyncSettings> {
  const stored = (await chrome.storage.local.get(SYNC_KEY))[SYNC_KEY] as Partial<SyncSettings> | undefined;
  return { apiUrl: DEFAULT_API_URL, enabled: false, ...stored };
}

export async function updateSyncSettings(patch: Partial<SyncSettings>): Promise<SyncSettings> {
  const next = { ...(await getSyncSettings()), ...patch };
  await chrome.storage.local.set({ [SYNC_KEY]: next });
  return next;
}

const base = (s: SyncSettings): string => s.apiUrl.replace(/\/+$/, "");

/**
 * fetch() against the sync server: `path` like "/api/users/42/trends". Adds the bearer token, and signs the user out
 * locally when the server says the token is no longer valid.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const s = await getSyncSettings();
  if (!s.token) throw new ApiError("Not signed in to a sync server", 401, "unauthenticated");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${s.token}`);
  const res = await fetch(`${base(s)}${path}`, { ...init, headers });
  if (res.status === 401) await updateSyncSettings({ token: undefined, user: undefined, enabled: false, lastError: "Session expired, sign in again" });
  return res;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  return data as T;
}

/** GET/POST/... returning parsed JSON (throws ApiError with the server's message). */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  return jsonOrThrow<T>(await apiFetch(path, { method, ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) }));
}

async function authCall(apiUrl: string, path: string, body: unknown): Promise<SyncSettings> {
  const url = apiUrl.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(`Cannot reach ${url}`, 0, "unreachable");
  }
  const data = await jsonOrThrow<{ token: string; user: SyncUser }>(res);
  return updateSyncSettings({ apiUrl: url, token: data.token, user: data.user, enabled: true, lastError: undefined });
}

export const register = (apiUrl: string, name: string, email: string, password: string) => authCall(apiUrl, "/api/auth/register", { name, email, password });
export const login = (apiUrl: string, email: string, password: string) => authCall(apiUrl, "/api/auth/login", { email, password });
export const logout = () => updateSyncSettings({ token: undefined, user: undefined, enabled: false });

/** One sample as uploaded (the server rates and de-duplicates it). */
export interface UploadSample {
  id: string;
  name: string;
  value: number;
  url: string;
  timestamp: number;
  navigationType?: string;
}

export interface UploadContext {
  device?: "desktop" | "mobile" | "tablet";
  browser?: string;
  connection?: string;
}

export async function uploadSamples(samples: UploadSample[], context: UploadContext): Promise<{ accepted: number; rejected: number; alertsTriggered: number }> {
  return api("POST", "/api/vitals", { samples, context });
}
