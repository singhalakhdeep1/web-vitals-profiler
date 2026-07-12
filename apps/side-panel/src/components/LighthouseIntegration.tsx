import React, { useState, useEffect } from 'react';

interface LighthouseReport {
  id: string;
  url: string;
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  pwa: number;
  generatedAt: Date;
  metrics: {
    'first-contentful-paint': number;
    'largest-contentful-paint': number;
    'total-blocking-time': number;
    'cumulative-layout-shift': number;
    'speed-index': number;
  };
}

interface LighthouseIntegrationProps {
  userId: string;
}

export function LighthouseIntegration({ userId }: LighthouseIntegrationProps) {
  const [reports, setReports] = useState<LighthouseReport[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [selectedReport, setSelectedReport] = useState<LighthouseReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, [userId]);

  const fetchReports = async () => {
    try {
      const response = await fetch(`/api/users/${userId}/lighthouse-reports`);
      if (response.ok) {
        const data = await response.json();
        setReports(data);
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const runLighthouse = async () => {
    if (!urlInput) return;

    setIsRunning(true);
    try {
      const response = await fetch('/api/lighthouse/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, url: urlInput }),
      });

      if (response.ok) {
        const report = await response.json();
        setReports(prev => [report, ...prev]);
        setSelectedReport(report);
        setUrlInput('');
      }
    } catch (error) {
      console.error('Failed to run Lighthouse:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Good';
    if (score >= 50) return 'Needs Improvement';
    return 'Poor';
  };

  if (isLoading) return <div>Loading Lighthouse reports...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Lighthouse Integration</h2>

      {/* Run Lighthouse */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Run Audit</h3>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 border rounded px-3 py-2"
          />
          <button
            onClick={runLighthouse}
            disabled={!urlInput || isRunning}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
          >
            {isRunning ? 'Running...' : 'Run Audit'}
          </button>
        </div>
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        <h3 className="font-semibold">Recent Reports</h3>
        {reports.map((report) => (
          <div
            key={report.id}
            onClick={() => setSelectedReport(report)}
            className={`border rounded-lg p-4 cursor-pointer ${
              selectedReport?.id === report.id ? 'border-blue-500' : ''
            }`}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-medium">{report.url}</h4>
                <p className="text-sm text-gray-600">
                  {new Date(report.generatedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <div className="text-center">
                  <div className={`w-12 h-12 rounded-full ${getScoreColor(report.performance)} flex items-center justify-center text-white font-bold`}>
                    {Math.round(report.performance)}
                  </div>
                  <p className="text-xs mt-1">Performance</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-xs text-gray-600">Accessibility</p>
                <p className="font-medium">{Math.round(report.accessibility)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Best Practices</p>
                <p className="font-medium">{Math.round(report.bestPractices)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">SEO</p>
                <p className="font-medium">{Math.round(report.seo)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">PWA</p>
                <p className="font-medium">{Math.round(report.pwa)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Report Detail */}
      {selectedReport && (
        <div className="border rounded-lg p-4">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-semibold">{selectedReport.url}</h3>
            <button
              onClick={() => setSelectedReport(null)}
              className="text-gray-600 hover:text-gray-800"
            >
              ✕
            </button>
          </div>

          {/* Scores */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Performance', score: selectedReport.performance },
              { label: 'Accessibility', score: selectedReport.accessibility },
              { label: 'Best Practices', score: selectedReport.bestPractices },
              { label: 'SEO', score: selectedReport.seo },
              { label: 'PWA', score: selectedReport.pwa },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className={`w-16 h-16 rounded-full ${getScoreColor(item.score)} flex items-center justify-center text-white font-bold mx-auto`}>
                  {Math.round(item.score)}
                </div>
                <p className="text-xs mt-2">{item.label}</p>
                <p className="text-xs text-gray-600">{getScoreLabel(item.score)}</p>
              </div>
            ))}
          </div>

          {/* Metrics */}
          <div className="mb-4">
            <h4 className="font-medium mb-3">Core Metrics</h4>
            <div className="space-y-2">
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm">First Contentful Paint</span>
                <span className="font-medium">{selectedReport.metrics['first-contentful-paint']}ms</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm">Largest Contentful Paint</span>
                <span className="font-medium">{selectedReport.metrics['largest-contentful-paint']}ms</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm">Total Blocking Time</span>
                <span className="font-medium">{selectedReport.metrics['total-blocking-time']}ms</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm">Cumulative Layout Shift</span>
                <span className="font-medium">{selectedReport.metrics['cumulative-layout-shift']}</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm">Speed Index</span>
                <span className="font-medium">{selectedReport.metrics['speed-index']}ms</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-blue-500 text-white rounded text-sm">
              Download Report
            </button>
            <button className="px-3 py-1 border rounded text-sm">
              View in Lighthouse
            </button>
            <button className="px-3 py-1 border rounded text-sm">
              Share
            </button>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Audit Settings</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">Performance</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">Accessibility</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">Best Practices</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">SEO</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" />
            <span className="text-sm">PWA</span>
          </label>
          <div>
            <label className="block text-sm font-medium mb-2">Device</label>
            <select className="w-full border rounded px-3 py-2">
              <option>Desktop</option>
              <option>Mobile</option>
              <option>Both</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
