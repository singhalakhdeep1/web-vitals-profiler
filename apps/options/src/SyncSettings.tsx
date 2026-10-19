import { useCallback, useEffect, useState } from "react";
import { DEFAULT_API_URL, getSyncSettings, login, logout, register, SYNC_KEY, updateSyncSettings } from "@wvp/api-client";
import { createMessage } from "@wvp/messaging";
import type { SyncStatus } from "@wvp/types";
import { Button } from "@wvp/ui/button";
import { Card } from "@wvp/ui/card";

const input = "w-full rounded border border-slate-200 px-3 py-2 text-sm";

/** Sign in to a sync server: measured vitals are uploaded for history, budgets, alerts and team dashboards. */
export function SyncSettings() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await chrome.runtime.sendMessage(createMessage("SYNC_STATUS"));
    if (res?.success) setStatus(res.data as SyncStatus);
  }, []);

  useEffect(() => {
    void getSyncSettings().then((s) => setApiUrl(s.apiUrl));
    void refresh();
    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[SYNC_KEY] || changes["wvp:upload-queue"]) void refresh();
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "register") await register(apiUrl, name, email, password);
      else await login(apiUrl, email, password);
      setPassword("");
      setMessage("Signed in. New measurements will be synced.");
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    const res = await chrome.runtime.sendMessage(createMessage("SYNC_NOW"));
    setMessage(res?.success ? "Everything is synced" : `Sync failed: ${res?.error ?? "unknown error"}`);
    await refresh();
    setBusy(false);
  }

  if (!status) return null;

  if (!status.signedIn) {
    return (
      <Card title="Cloud Sync" description="Sync measurements to a Web Vitals Profiler server for history, budgets, alerts, Lighthouse runs and team dashboards">
        <form className="space-y-2" onSubmit={(e) => void submit(e)} data-testid="sync-form">
          <label className="block text-xs font-medium text-slate-600">
            Server
            <input className={input} value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://vitals.example.com" required />
          </label>
          {mode === "register" && <input className={input} placeholder="Name" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} required />}
          <input className={input} type="email" placeholder="E-mail" aria-label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className={input} type="password" placeholder="Password (8+ characters, a letter and a digit)" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={busy}>{mode === "register" ? "Create account" : "Sign in"}</Button>
            <button type="button" className="text-sm text-blue-600 hover:underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "Create an account instead" : "I already have an account"}
            </button>
          </div>
        </form>
        {(message ?? status.lastError) && <p className="mt-2 text-sm text-slate-600" role="status">{message ?? status.lastError}</p>}
      </Card>
    );
  }

  return (
    <Card title="Cloud Sync" description={`Signed in to ${status.apiUrl}`}>
      <div className="space-y-3 text-sm" data-testid="sync-status">
        <p>
          <span className="font-medium">{status.user?.name}</span> <span className="text-slate-500">({status.user?.email})</span>
        </p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={status.enabled} onChange={(e) => void updateSyncSettings({ enabled: e.target.checked }).then(refresh)} />
          Upload new measurements
        </label>
        <p className="text-slate-600">
          {status.queued} waiting to upload · last sync {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : "never"}
        </p>
        {status.lastError && <p className="text-amber-700">Last error: {status.lastError}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void syncNow()}>Sync now</Button>
          <Button variant="secondary" onClick={() => void logout().then(refresh)}>Sign out</Button>
        </div>
        {message && <p className="text-slate-600" role="status">{message}</p>}
      </div>
    </Card>
  );
}
