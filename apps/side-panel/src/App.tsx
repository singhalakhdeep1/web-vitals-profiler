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
import { useMemo } from "react";

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

  return (
    <div className="min-h-screen bg-white">
      <Header title="Vitals Panel" subtitle="Live + historical trends" />
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
    </div>
  );
}
