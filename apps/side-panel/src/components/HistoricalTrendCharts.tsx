import { useState, useEffect } from 'react';
import { apiFetch } from '@wvp/api-client';

interface TrendData {
  date: Date;
  metric: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
  value: number;
}

interface HistoricalTrendChartsProps {
  userId: string;
}

export function HistoricalTrendCharts({ userId }: HistoricalTrendChartsProps) {
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'>('LCP');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTrendData();
  }, [userId, selectedMetric, timeRange]);

  /** Downloads the trend as CSV, JSON or an SVG line chart. */
  const exportData = (format: 'csv' | 'json' | 'svg') => {
    let body: string;
    let type: string;
    if (format === 'csv') {
      body = ['date,metric,p75', ...trendData.map((d) => `${new Date(d.date).toISOString().slice(0, 10)},${d.metric},${d.value}`)].join('\n');
      type = 'text/csv';
    } else if (format === 'json') {
      body = JSON.stringify(trendData, null, 2);
      type = 'application/json';
    } else {
      const w = 640;
      const h = 240;
      const max = Math.max(1, ...trendData.map((d) => d.value));
      const pts = trendData.map((d, i) => `${20 + (i * (w - 40)) / Math.max(1, trendData.length - 1)},${h - 20 - (d.value / max) * (h - 40)}`).join(' ');
      body = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#fff"/><text x="20" y="16" font-family="sans-serif" font-size="12">${selectedMetric} p75 (${timeRange})</text><polyline fill="none" stroke="#2563eb" stroke-width="2" points="${pts}"/></svg>`;
      type = 'image/svg+xml';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type }));
    a.download = `${selectedMetric.toLowerCase()}-trend-${timeRange}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  const fetchTrendData = async () => {
    try {
      const response = await apiFetch(
        `/api/users/${userId}/trends?metric=${selectedMetric}&range=${timeRange}`
      );
      if (response.ok) {
        const data = await response.json();
        setTrendData(data);
      }
    } catch (error) {
      console.error('Failed to fetch trend data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getMetricLabel = (metric: string) => {
    const labels: Record<string, string> = {
      LCP: 'Largest Contentful Paint',
      INP: 'Interaction to Next Paint',
      CLS: 'Cumulative Layout Shift',
      FCP: 'First Contentful Paint',
      TTFB: 'Time to First Byte',
    };
    return labels[metric] || metric;
  };

  const getMetricUnit = (metric: string) => {
    const units: Record<string, string> = {
      LCP: 'ms',
      INP: 'ms',
      CLS: '',
      FCP: 'ms',
      TTFB: 'ms',
    };
    return units[metric] || '';
  };

  const getAverage = () => {
    if (trendData.length === 0) return 0;
    const sum = trendData.reduce((acc, d) => acc + d.value, 0);
    return (sum / trendData.length).toFixed(1);
  };

  const getMin = () => {
    if (trendData.length === 0) return 0;
    return Math.min(...trendData.map(d => d.value)).toFixed(1);
  };

  const getMax = () => {
    if (trendData.length === 0) return 0;
    return Math.max(...trendData.map(d => d.value)).toFixed(1);
  };

  if (isLoading) return <div>Loading trend data...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Historical Trend Charts</h2>

      {/* Controls */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Metric</label>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as TrendData['metric'])}
            className="w-full border rounded px-3 py-2"
          >
            <option value="LCP">Largest Contentful Paint</option>
            <option value="INP">Interaction to Next Paint</option>
            <option value="CLS">Cumulative Layout Shift</option>
            <option value="FCP">First Contentful Paint</option>
            <option value="TTFB">Time to First Byte</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Time Range</label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
            className="border rounded px-3 py-2"
          >
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="90d">90 Days</option>
          </select>
        </div>
      </div>

      {/* Chart Placeholder */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">{getMetricLabel(selectedMetric)} Trend</h3>
        <div className="h-64 bg-gray-50 rounded flex items-center justify-center">
          <p className="text-gray-500">Interactive trend chart would display here</p>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-gray-600">Average</p>
          <p className="text-2xl font-bold">
            {getAverage()}{getMetricUnit(selectedMetric)}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-gray-600">Minimum</p>
          <p className="text-2xl font-bold">
            {getMin()}{getMetricUnit(selectedMetric)}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-gray-600">Maximum</p>
          <p className="text-2xl font-bold">
            {getMax()}{getMetricUnit(selectedMetric)}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-gray-600">Data Points</p>
          <p className="text-2xl font-bold">{trendData.length}</p>
        </div>
      </div>

      {/* Data Table */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Data Points</h3>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {trendData.map((data, idx) => {
                const prevData = trendData[idx - 1];
                const change = prevData
                  ? ((data.value - prevData.value) / prevData.value * 100).toFixed(1)
                  : '0.0';
                const isPositive = parseFloat(change) >= 0;

                return (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2">
                      {new Date(data.date).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {data.value}{getMetricUnit(selectedMetric)}
                    </td>
                    <td className={`px-3 py-2 text-right ${isPositive ? 'text-red-600' : 'text-green-600'}`}>
                      {isPositive ? '+' : ''}{change}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparison */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Compare Metrics</h3>
        <div className="grid grid-cols-2 gap-4">
          {['LCP', 'INP', 'CLS', 'FCP', 'TTFB'].map((metric) => (
            <button
              key={metric}
              onClick={() => setSelectedMetric(metric as TrendData['metric'])}
              className={`p-3 border rounded text-left ${
                selectedMetric === metric ? 'border-blue-500 bg-blue-50' : ''
              }`}
            >
              <p className="font-medium">{getMetricLabel(metric)}</p>
              <p className="text-sm text-gray-600">View trend</p>
            </button>
          ))}
        </div>
      </div>

      {/* Export */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Export Data</h3>
        <div className="flex gap-2">
          <button onClick={() => exportData('csv')} className="px-4 py-2 bg-blue-500 text-white rounded text-sm">
            Export CSV
          </button>
          <button onClick={() => exportData('json')} className="px-4 py-2 border rounded text-sm">
            Export JSON
          </button>
          <button onClick={() => exportData('svg')} className="px-4 py-2 border rounded text-sm">
            Export Chart Image
          </button>
        </div>
      </div>
    </div>
  );
}
