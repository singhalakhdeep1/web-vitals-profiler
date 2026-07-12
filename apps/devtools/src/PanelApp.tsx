import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { formatVitalValue } from "@wvp/performance";
import { Card } from "@wvp/ui/card";
import { Header } from "@wvp/ui/header";
import { MetricRow } from "@wvp/ui/metric-row";
import type { VitalMetric, VitalsSnapshot } from "@wvp/types";

export function PanelApp() {
  const [snapshot, setSnapshot] = useState<VitalsSnapshot | null>(null);
  const [timeline, setTimeline] = useState<VitalMetric[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: "wvp-devtools" });

    port.onMessage.addListener((msg: {
      type: string;
      snapshot?: VitalsSnapshot;
      metric?: VitalMetric;
      metrics?: VitalMetric[];
    }) => {
      if (msg.type === "connected") setConnected(true);
      if (msg.type === "vitals" && msg.snapshot) setSnapshot(msg.snapshot);
      if (msg.type === "vitals" && msg.metric) {
        setTimeline((prev) => [...prev.slice(-49), msg.metric!]);
      }
      if (msg.type === "timeline" && msg.metrics) setTimeline(msg.metrics);
    });

    port.postMessage({ type: "get-timeline" });

    chrome.devtools.network.onNavigated.addListener(() => {
      port.postMessage({ type: "get-timeline" });
    });

    return () => port.disconnect();
  }, []);

  const chartData = useMemo(
    () =>
      timeline.map((m) => ({
        time: new Date(m.timestamp).toLocaleTimeString(),
        value: m.value,
        name: m.name,
      })),
    [timeline],
  );

  const latestByName = snapshot?.metrics ?? {};

  return (
    <div className="min-h-screen bg-white">
      <Header
        title="Web Vitals DevTools"
        subtitle={connected ? "Streaming via long-lived port" : "Connecting…"}
      />
      <div className="space-y-4 p-4">
        <Card title="Live Snapshot">
          <div className="divide-y divide-slate-100">
            {(["LCP", "CLS", "INP", "FCP", "TTFB", "TBT"] as const).map((name) => {
              const m = latestByName[name];
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

        {chartData.length > 0 && (
          <Card title="Timeline" description={`${timeline.length} events`}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Legend />
                <Line type="stepAfter" dataKey="value" stroke="#2563eb" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {chartData.length > 0 && (
          <Card title="Event Distribution">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={Object.entries(
                  timeline.reduce<Record<string, number>>((acc, m) => {
                    acc[m.name] = (acc[m.name] ?? 0) + 1;
                    return acc;
                  }, {}),
                ).map(([name, count]) => ({ name, count }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
    </div>
  );
}
