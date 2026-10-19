import { useEffect, useState } from "react";
import type { CriticalPathAnalysis, ResourceAnalysis } from "@wvp/core";
import { createMessage } from "@wvp/messaging";
import { Card } from "@wvp/ui/card";

interface Analysis {
  url: string;
  collectedAt: number;
  resources: ResourceAnalysis;
  criticalPath: CriticalPathAnalysis;
}

const kb = (b: number) => `${Math.round(b / 1024)} KB`;
const IMPACT = { high: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-700", low: "bg-slate-100 text-slate-600" } as const;

/** Speed optimization for the current tab: render-blocking, heavy and third-party resources and the critical path. */
export function SpeedInsights({ tabId }: { tabId?: number }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!tabId) return;
    const load = () =>
      void chrome.runtime.sendMessage(createMessage("GET_PAGE_ANALYSIS", { tabId })).then((res) => {
        setAnalysis((res?.data as Analysis | null) ?? null);
        setLoaded(true);
      });
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [tabId]);

  if (!loaded) return <p className="text-sm text-slate-500">Analyzing…</p>;
  if (!analysis) return <p className="text-sm text-slate-500" data-testid="speed-empty">Reload the page to analyze its resources.</p>;

  const recs = [...analysis.criticalPath.recommendations, ...analysis.resources.recommendations];
  const r = analysis.resources;
  return (
    <div className="space-y-4" data-testid="speed-insights">
      <Card title="Page weight" description={new URL(analysis.url).pathname}>
        <p className="text-sm text-slate-700">
          {r.totalRequests} requests · {kb(r.totalTransferBytes)} transferred
        </p>
        <div className="mt-2 flex flex-wrap gap-1 text-xs">
          {Object.entries(r.byType).map(([type, v]) => (
            <span key={type} className="rounded bg-slate-100 px-2 py-0.5">
              {type}: {v.count} · {kb(v.bytes)}
            </span>
          ))}
        </div>
      </Card>

      {analysis.criticalPath.bottlenecks.length > 0 && (
        <Card title="Critical path">
          <ul className="space-y-1 text-sm">
            {analysis.criticalPath.bottlenecks.map((b) => (
              <li key={b.phase} className="flex justify-between gap-2">
                <span>{b.detail}</span>
                <span className="font-mono">{b.ms} ms</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Recommendations" description={recs.length ? `${recs.length} suggestions` : undefined}>
        {recs.length === 0 ? (
          <p className="text-sm text-emerald-700">No issues found in this page's resources.</p>
        ) : (
          <ul className="space-y-2" data-testid="recommendations">
            {recs.map((rec) => (
              <li key={rec.id} className="rounded border border-slate-200 p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{rec.title}</span>
                  <span className={`rounded px-1.5 text-xs ${IMPACT[rec.impact]}`}>{rec.impact}</span>
                </div>
                <p className="text-slate-600">{rec.detail}</p>
                {rec.resources && <p className="mt-1 truncate font-mono text-xs text-slate-500" title={rec.resources.join(", ")}>{rec.resources.slice(0, 4).join(", ")}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {r.thirdParty.length > 0 && (
        <Card title="Third-party origins">
          <ul className="space-y-1 text-sm">
            {r.thirdParty.slice(0, 8).map((t) => (
              <li key={t.origin} className="flex justify-between gap-2">
                <span className="truncate">{t.origin}</span>
                <span className="font-mono text-xs">{t.count} · {kb(t.bytes)} · {Math.round(t.time)} ms</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
