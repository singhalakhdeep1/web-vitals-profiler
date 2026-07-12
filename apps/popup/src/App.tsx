import { useActiveTab, useExtensionStatus, useExtensionVersion, useVitals, toggleOverlay } from "@wvp/hooks";
import { formatVitalValue } from "@wvp/performance";
import { Button } from "@wvp/ui/button";
import { Card } from "@wvp/ui/card";
import { Header } from "@wvp/ui/header";
import { MetricRow } from "@wvp/ui/metric-row";
import { StatusBadge } from "@wvp/ui/status-badge";
import type { VitalName } from "@wvp/types";

const VITAL_NAMES: VitalName[] = ["LCP", "CLS", "INP", "TTFB", "FCP", "TBT"];

export function App() {
  const { isConnected, isLoading, checkConnection } = useExtensionStatus();
  const { tabInfo, isLoading: tabLoading } = useActiveTab();
  const { metrics } = useVitals();
  const version = useExtensionVersion();

  const status = isLoading ? "loading" : isConnected ? "connected" : "disconnected";
  const statusLabel = isLoading ? "Checking…" : isConnected ? "Connected" : "Disconnected";

  return (
    <div className="flex min-h-[480px] flex-col">
      <Header title="Web Vitals Profiler" subtitle={`v${version} · Live Monitoring`} />

      <main className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <StatusBadge label={statusLabel} status={status} />
          <Button variant="ghost" onClick={() => void checkConnection()}>Refresh</Button>
        </div>

        <Card title="Active Tab">
          {tabLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : tabInfo ? (
            <div className="space-y-1 text-sm">
              <p className="truncate font-medium text-slate-800">{tabInfo.title || "Untitled"}</p>
              <p className="truncate text-xs text-slate-500">{tabInfo.url}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No active tab</p>
          )}
        </Card>

        <Card title="Core Web Vitals" description="Live metrics from this page">
          <div className="divide-y divide-slate-100">
            {VITAL_NAMES.map((name) => {
              const m = metrics[name];
              return (
                <MetricRow
                  key={name}
                  name={name}
                  value={m ? formatVitalValue(name, m.value) : "—"}
                  rating={m?.rating}
                />
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => void toggleOverlay(true)}>Show Overlay</Button>
          <Button variant="secondary" onClick={() => void toggleOverlay(false)}>Hide Overlay</Button>
        </div>

        <Button variant="secondary" className="w-full" onClick={() => chrome.runtime.openOptionsPage()}>
          Settings & Export
        </Button>
      </main>
    </div>
  );
}
