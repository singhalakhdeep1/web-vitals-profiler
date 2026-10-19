import { useState, useEffect } from "react";
import {
  useExtensionVersion,
  useRegressions,
  exportReport,
  toggleOverlay,
  useVitalsStore,
} from "@wvp/hooks";
import { createMessage } from "@wvp/messaging";
import type { SessionRecord } from "@wvp/types";
import { Button } from "@wvp/ui/button";
import { Card } from "@wvp/ui/card";
import { Header } from "@wvp/ui/header";
import { SyncSettings } from "./SyncSettings";

export function App() {
  const version = useExtensionVersion();
  const [url, setUrl] = useState("");
  const [slackUrl, setSlackUrl] = useState("");
  const [status, setStatus] = useState("");
  const { overlayEnabled } = useVitalsStore();
  const regressions = useRegressions(url || undefined);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  useEffect(() => {
    void chrome.runtime
      .sendMessage(createMessage("GET_SESSIONS", { limit: 10 }))
      .then((res) => {
        if (res?.success) setSessions(res.data as SessionRecord[]);
      });
  }, []);

  async function handleExport(format: "json" | "csv" | "html") {
    setStatus("Exporting…");
    const content = await exportReport(format, url || undefined);
    if (!content) {
      setStatus("Export failed");
      return;
    }
    const blob = new Blob([content], {
      type: format === "html" ? "text/html" : format === "csv" ? "text/csv" : "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `web-vitals-report.${format}`;
    a.click();
    setStatus(`Exported ${format.toUpperCase()} report`);
  }

  async function handleSlackExport() {
    if (!slackUrl) {
      setStatus("Enter a Slack webhook URL");
      return;
    }
    await chrome.storage.local.set({
      "wvp:state": {
        ...(await chrome.storage.local.get("wvp:state"))["wvp:state"],
        slackWebhookUrl: slackUrl,
      },
    });
    setStatus("Sending to Slack…");
    const content = await exportReport("html", url || undefined, true);
    setStatus(content ? "Slack notification sent" : "Slack send failed");
  }

  async function handleClearData() {
    const response = await chrome.runtime.sendMessage({
      type: "CLEAR_DATA",
      timestamp: Date.now(),
    });
    if (response?.success) setStatus("All metrics cleared");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header title="Settings" subtitle={`Web Vitals Profiler v${version}`} />
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Card title="Extension Info">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Version</dt>
              <dd className="font-mono text-slate-800">{version}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Status</dt>
              <dd className="font-mono text-emerald-600">Active</dd>
            </div>
          </dl>
        </Card>

        <SyncSettings />

        <Card title="On-Page Overlay">
          <p className="mb-3 text-sm text-slate-600">
            Show a floating vitals badge on every page. Currently: {overlayEnabled ? "ON" : "OFF"}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void toggleOverlay(true)}>Enable</Button>
            <Button variant="secondary" onClick={() => void toggleOverlay(false)}>Disable</Button>
          </div>
        </Card>

        <Card title="Export Reports">
          <input
            className="mb-3 w-full rounded border border-slate-200 px-3 py-2 text-sm"
            placeholder="Filter by URL (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void handleExport("json")}>Export JSON</Button>
            <Button variant="secondary" onClick={() => void handleExport("csv")}>Export CSV</Button>
            <Button variant="secondary" onClick={() => void handleExport("html")}>Export HTML</Button>
          </div>
        </Card>

        <Card title="Slack Integration">
          <input
            className="mb-3 w-full rounded border border-slate-200 px-3 py-2 text-sm"
            placeholder="Slack webhook URL"
            value={slackUrl}
            onChange={(e) => setSlackUrl(e.target.value)}
          />
          <Button variant="secondary" onClick={() => void handleSlackExport()}>Send Report to Slack</Button>
        </Card>

        {regressions.length > 0 && (
          <Card title="Regression Detection" description="Comparing last week vs 4-week average">
            <div className="space-y-2">
              {regressions
                .filter((r) => r.regressed)
                .map((r) => (
                  <div key={r.metric} className="rounded border border-amber-200 bg-amber-50 p-2 text-sm">
                    <span className="font-medium">{r.metric}</span>: +{r.changePercent}% ({r.severity})
                  </div>
                ))}
              {regressions.filter((r) => r.regressed).length === 0 && (
                <p className="text-sm text-emerald-600">No regressions detected</p>
              )}
            </div>
          </Card>
        )}

        {sessions.length > 0 && (
          <Card title="Session History" description="Saved when tabs close with recorded metrics">
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="rounded border border-slate-200 p-2 text-sm">
                  <p className="truncate font-medium">{s.url}</p>
                  <p className="text-slate-500">{s.metrics.length} metrics · {new Date(s.endedAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card title="Data Management">
          <Button variant="secondary" onClick={() => void handleClearData()}>Clear All Stored Metrics</Button>
        </Card>

        {status && <p className="text-sm text-slate-500">{status}</p>}
      </div>
    </div>
  );
}
