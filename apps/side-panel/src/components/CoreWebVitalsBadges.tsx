import { useState, useEffect } from 'react';
import { apiFetch } from '@wvp/api-client';

interface BadgeConfig {
  id: string;
  name: string;
  type: 'LCP' | 'INP' | 'CLS' | 'overall';
  style: 'minimal' | 'detailed' | 'score';
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  enabled: boolean;
  /** Served by the API as SVG for embedding. */
  imageUrl?: string;
  /** Ready-to-paste HTML that pins the badge in the chosen corner of a page. */
  embedHtml?: string;
}

interface BadgeData {
  metric: string;
  value: number;
  status: 'good' | 'needs-improvement' | 'poor';
  threshold: {
    good: number;
    needsImprovement: number;
  };
}

interface CoreWebVitalsBadgesProps {
  userId: string;
}

export function CoreWebVitalsBadges({ userId }: CoreWebVitalsBadgesProps) {
  const [configs, setConfigs] = useState<BadgeConfig[]>([]);
  const [badgeData, setBadgeData] = useState<BadgeData[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newConfig, setNewConfig] = useState({
    name: '',
    type: 'overall' as BadgeConfig['type'],
    style: 'minimal' as BadgeConfig['style'],
    position: 'bottom-right' as BadgeConfig['position'],
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchConfigs();
    fetchBadgeData();
  }, [userId]);

  const fetchConfigs = async () => {
    try {
      const response = await apiFetch(`/api/users/${userId}/badge-configs`);
      if (response.ok) {
        const data = await response.json();
        setConfigs(data);
      }
    } catch (error) {
      console.error('Failed to fetch configs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBadgeData = async () => {
    try {
      const response = await apiFetch(`/api/users/${userId}/badge-data`);
      if (response.ok) {
        const data = await response.json();
        setBadgeData(data);
      }
    } catch (error) {
      console.error('Failed to fetch badge data:', error);
    }
  };

  const createConfig = async () => {
    try {
      const response = await apiFetch('/api/badge-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...newConfig }),
      });

      if (response.ok) {
        const config = await response.json();
        setConfigs(prev => [...prev, config]);
        setIsCreating(false);
        setNewConfig({
          name: '',
          type: 'overall',
          style: 'minimal',
          position: 'bottom-right',
        });
      }
    } catch (error) {
      console.error('Failed to create config:', error);
    }
  };

  const toggleBadge = async (id: string) => {
    try {
      const response = await apiFetch(`/api/badge-configs/${id}/toggle`, {
        method: 'POST',
      });

      if (response.ok) {
        setConfigs(prev =>
          prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c)
        );
      }
    } catch (error) {
      console.error('Failed to toggle badge:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      good: 'bg-green-500',
      'needs-improvement': 'bg-yellow-500',
      poor: 'bg-red-500',
    };
    return colors[status] || colors.poor;
  };

  const getMetricLabel = (metric: string) => {
    const labels: Record<string, string> = {
      LCP: 'Largest Contentful Paint',
      INP: 'Interaction to Next Paint',
      CLS: 'Cumulative Layout Shift',
      overall: 'Overall Score',
    };
    return labels[metric] || metric;
  };

  /** The badge exactly as the server renders it for websites (disabled badges are not served). */
  const getBadgePreview = (config: BadgeConfig) => {
    if (!config.enabled || !config.imageUrl) {
      return <div className="rounded bg-gray-200 px-2 py-1 text-xs text-gray-600">disabled</div>;
    }
    return <img src={`${config.imageUrl}?v=${badgeData.length}`} alt={`${config.name} badge`} className="h-5" data-testid="badge-image" />;
  };

  if (isLoading) return <div>Loading badge configurations...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Core Web Vitals Badges</h2>

      {/* Badge Configurations */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Badge Configurations</h3>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
          >
            {isCreating ? 'Cancel' : '+ Add Badge'}
          </button>
        </div>

        {isCreating && (
          <div className="space-y-3 p-3 bg-gray-50 rounded mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={newConfig.name}
                onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })}
                placeholder="e.g., Production Badge"
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={newConfig.type}
                onChange={(e) => setNewConfig({ ...newConfig, type: e.target.value as BadgeConfig['type'] })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="overall">Overall Score</option>
                <option value="LCP">Largest Contentful Paint</option>
                <option value="INP">Interaction to Next Paint</option>
                <option value="CLS">Cumulative Layout Shift</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Style</label>
              <select
                value={newConfig.style}
                onChange={(e) => setNewConfig({ ...newConfig, style: e.target.value as BadgeConfig['style'] })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="minimal">Minimal (Circle)</option>
                <option value="score">Score Badge</option>
                <option value="detailed">Detailed Card</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Position</label>
              <select
                value={newConfig.position}
                onChange={(e) => setNewConfig({ ...newConfig, position: e.target.value as BadgeConfig['position'] })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="top-right">Top Right</option>
                <option value="top-left">Top Left</option>
              </select>
            </div>
            <button
              onClick={createConfig}
              disabled={!newConfig.name}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              Create Badge
            </button>
          </div>
        )}

        <div className="space-y-3">
          {configs.map((config) => (
            <div key={config.id} className="flex items-center justify-between p-3 border rounded">
              <div className="flex items-center gap-4">
                {getBadgePreview(config)}
                <div>
                  <p className="font-medium">{config.name}</p>
                  <p className="text-sm text-gray-600 capitalize">
                    {config.type} • {config.style} • {config.position}
                  </p>
                  {config.embedHtml && (
                    <input readOnly className="mt-1 w-full rounded border px-1 py-0.5 font-mono text-[10px]" value={config.embedHtml} onFocus={(e) => e.currentTarget.select()} aria-label={`Embed code for ${config.name}`} />
                  )}
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={() => toggleBadge(config.id)}
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Current Metrics */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Current Core Web Vitals</h3>
        <div className="grid grid-cols-3 gap-4">
          {badgeData.map((data) => (
            <div key={data.metric} className="border rounded p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(data.status)}`} />
                <p className="font-medium text-sm">{getMetricLabel(data.metric)}</p>
              </div>
              <p className="text-2xl font-bold">{data.value}</p>
              <p className="text-xs text-gray-600 capitalize">{data.status}</p>
              <div className="mt-2 text-xs text-gray-500">
                <p>Good: &lt;{data.threshold.good}</p>
                <p>Needs Improvement: &lt;{data.threshold.needsImprovement}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Embed Code */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Embed Code</h3>
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Add this snippet to your website:</p>
          <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-x-auto">
{`<script src="https://cdn.example.com/web-vitals-badge.js"></script>
<script>
  WebVitalsBadge.init({
    apiKey: 'YOUR_API_KEY',
    position: 'bottom-right'
  });
</script>`}
          </pre>
        </div>
      </div>

      {/* Badge Styles Preview */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Style Preview</h3>
        <div className="flex gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-2">Minimal</p>
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold mx-auto">
              95
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-2">Score</p>
            <div className="bg-gray-800 text-white px-3 py-1 rounded-full text-sm">
              95/100
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-2">Detailed</p>
            <div className="bg-gray-800 text-white p-2 rounded text-xs w-24">
              <p className="font-medium">LCP</p>
              <p>1.2s</p>
            </div>
          </div>
        </div>
      </div>

      {/* Customization */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Customization</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Theme</label>
            <select className="w-full border rounded px-3 py-2">
              <option>Light</option>
              <option>Dark</option>
              <option>Auto</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Animation</label>
            <select className="w-full border rounded px-3 py-2">
              <option>None</option>
              <option>Fade In</option>
              <option>Slide Up</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">Show on hover only</span>
          </label>
        </div>
      </div>
    </div>
  );
}
