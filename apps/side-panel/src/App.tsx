import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useActiveTab, useExtensionStatus, useVitals, useVitalsHistory } from "@wvp/hooks";
import { formatVitalValue } from "@wvp/performance";
import { Card } from "@wvp/ui/card";
import { Header } from "@wvp/ui/header";
import { MetricRow } from "@wvp/ui/metric-row";
import { StatusBadge } from "@wvp/ui/status-badge";
import type { VitalName } from "@wvp/types";
import { useEffect, useMemo, useState } from "react";
import { getSyncSettings, SYNC_KEY, type SyncSettings } from "@wvp/api-client";
import { ABTestComparison } from "./components/ABTestComparison";
import { CoreWebVitalsBadges } from "./components/CoreWebVitalsBadges";
import { HistoricalTrendCharts } from "./components/HistoricalTrendCharts";
import { LighthouseIntegration } from "./components/LighthouseIntegration";
import { PerformanceBudgets } from "./components/PerformanceBudgets";
import { PerformanceScoring } from "./components/PerformanceScoring";
import { SlackEmailAlerting } from "./components/SlackEmailAlerting";
import { SpeedInsights } from "./components/SpeedInsights";
import { TeamDashboards } from "./components/TeamDashboards";

const TABS = [
  { id: "live", label: "Live" },
  { id: "speed", label: "Speed" },
  { id: "trends", label: "Trends", cloud: true },
  { id: "budgets", label: "Budgets", cloud: true },
  { id: "scores", label: "Scores", cloud: true },
  { id: "lighthouse", label: "Lighthouse", cloud: true },
  { id: "alerts", label: "Alerts", cloud: true },
  { id: "team", label: "Team", cloud: true },
  { id: "ab", label: "A/B", cloud: true },
  { id: "badges", label: "Badges", cloud: true },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** The sync session (the server-backed tabs need it); follows sign-in / sign-out from the options page. */
function useSyncSession(): SyncSettings | null {
  const [s, setS] = useState<SyncSettings | null>(null);
  useEffect(() => {
    void getSyncSettings().then(setS);
    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[SYNC_KEY]) void getSyncSettings().then(setS);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);
  return s;
}

const VITAL_NAMES: VitalName[] = ["LCP", "CLS", "INP", "FCP", "TTFB", "TBT"];

export function App() {
  const { isConnected, isLoading } = useExtensionStatus();
  const { tabInfo } = useActiveTab();
  const { metrics } = useVitals();
  const history = useVitalsHistory(tabInfo?.url);

  const status = isLoading ? "loading" : isConnected ? "connected" : "disconnected";
  const statusLabel = isLoading ? "Checking…" : isConnected ? "Connected" : "Disconnected";

  const chartData = useMemo(() => {
    const byTime = new Map<number, Record<string, number>>();
    for (const m of history) {
      const bucket = Math.floor(m.timestamp / 10000) * 10000;
      const row = byTime.get(bucket) ?? { time: bucket };
      row[m.name] = m.value;
      byTime.set(bucket, row);
    }
    return [...byTime.values()]
      .sort((a, b) => (a.time as number) - (b.time as number))
      .map((row) => ({
        ...row,
        label: new Date(row.time as number).toLocaleTimeString(),
      }));
  }, [history]);

  const [tab, setTab] = useState<TabId>("live");
  const session = useSyncSession();
  const current = TABS.find((t) => t.id === tab)!;
  const userId = session?.token ? session.user?.id : undefined;

  return (
    <div className="min-h-screen bg-white">
      <Header title="Vitals Panel" subtitle={session?.user ? `Synced as ${session.user.email}` : "Live + historical trends"} />
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 px-2 py-1" role="tablist" aria-label="Views">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`rounded px-2 py-1 text-xs font-medium ${tab === t.id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {"cloud" in current && current.cloud && !userId ? (
        <div className="p-4" data-testid="sign-in-prompt">
          <Card title="Sign in to a sync server" description="Trends, budgets, scores, Lighthouse runs, alerts, team dashboards, A/B tests and badges are computed by the sync server from your synced measurements.">
            <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => chrome.runtime.openOptionsPage()}>
              Open settings
            </button>
          </Card>
        </div>
      ) : tab === "trends" && userId ? (
        <div className="p-4"><HistoricalTrendCharts userId={userId} /></div>
      ) : tab === "budgets" && userId ? (
        <div className="p-4"><PerformanceBudgets userId={userId} /></div>
      ) : tab === "scores" && userId ? (
        <div className="p-4"><PerformanceScoring userId={userId} /></div>
      ) : tab === "lighthouse" && userId ? (
        <div className="p-4"><LighthouseIntegration userId={userId} /></div>
      ) : tab === "alerts" && userId ? (
        <div className="p-4"><SlackEmailAlerting userId={userId} /></div>
      ) : tab === "team" && userId ? (
        <div className="p-4"><TeamDashboards userId={userId} /></div>
      ) : tab === "ab" && userId ? (
        <div className="p-4"><ABTestComparison userId={userId} /></div>
      ) : tab === "badges" && userId ? (
        <div className="p-4"><CoreWebVitalsBadges userId={userId} /></div>
      ) : tab === "speed" ? (
        <div className="p-4"><SpeedInsights tabId={tabInfo?.tabId} /></div>
      ) : (
      <div className="space-y-4 p-4">
        <StatusBadge label={statusLabel} status={status} />

        <Card title="Live Metrics">
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

        {chartData.length > 1 && (
          <Card title="Historical Trend" description={`${history.length} samples`}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="LCP" stroke="#2563eb" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="FCP" stroke="#7c3aed" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="INP" stroke="#059669" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
      )}
    </div>
  );
}
