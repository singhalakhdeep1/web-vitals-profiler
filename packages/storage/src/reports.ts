import type { VitalMetric } from "@wvp/types";
import { exportMetricsCsv, exportMetricsJson, getMetrics } from "./index";

/** Generates an HTML performance report. */
export async function exportMetricsHtml(url?: string): Promise<string> {
  const metrics = await getMetrics(url ? { url } : undefined);
  const grouped = groupByName(metrics);
  const generatedAt = new Date().toISOString();

  const rows = Object.entries(grouped)
    .map(([name, items]) => {
      const avg = items.reduce((s, m) => s + m.value, 0) / items.length;
      const latest = items[0];
      const rating = latest?.rating ?? "good";
      const ratingColor =
        rating === "good" ? "#059669" : rating === "needs-improvement" ? "#d97706" : "#dc2626";
      return `<tr>
        <td>${name}</td>
        <td>${formatValue(name, avg)}</td>
        <td style="color:${ratingColor}">${rating}</td>
        <td>${items.length}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Web Vitals Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
    th, td { border: 1px solid #e2e8f0; padding: 0.75rem; text-align: left; }
    th { background: #f8fafc; }
    .meta { color: #64748b; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>Web Vitals Performance Report</h1>
  <p class="meta">Generated: ${generatedAt}${url ? ` · URL filter: ${url}` : ""}</p>
  <p class="meta">Total measurements: ${metrics.length}</p>
  <table>
    <thead><tr><th>Metric</th><th>Average</th><th>Latest Rating</th><th>Samples</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

/** Sends a Slack notification with vitals summary. */
export async function sendSlackNotification(
  webhookUrl: string,
  metrics: VitalMetric[],
  url: string,
): Promise<boolean> {
  if (!webhookUrl || metrics.length === 0) return false;

  const latest = metrics.slice(0, 6);
  const fields = latest.map((m) => ({
    type: "mrkdwn" as const,
    text: `*${m.name}:* ${formatValue(m.name, m.value)} (${m.rating})`,
  }));

  const payload = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Web Vitals Profiler Report" },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Page:* ${url}` },
      },
      { type: "section", fields },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Exports metrics in the requested format. */
export async function exportReport(
  format: "json" | "csv" | "html",
  url?: string,
): Promise<string> {
  switch (format) {
    case "json":
      return exportMetricsJson(url);
    case "csv":
      return exportMetricsCsv(url);
    case "html":
      return exportMetricsHtml(url);
  }
}

function groupByName(metrics: VitalMetric[]): Record<string, VitalMetric[]> {
  return metrics.reduce<Record<string, VitalMetric[]>>((acc, m) => {
    acc[m.name] = acc[m.name] ?? [];
    acc[m.name].push(m);
    return acc;
  }, {});
}

function formatValue(name: string, value: number): string {
  if (name === "CLS") return value.toFixed(3);
  return `${Math.round(value)}ms`;
}
