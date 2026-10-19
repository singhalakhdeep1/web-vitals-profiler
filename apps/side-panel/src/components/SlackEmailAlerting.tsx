import { useState, useEffect } from 'react';
import { apiFetch } from '@wvp/api-client';

interface AlertChannel {
  id: string;
  type: 'slack' | 'email';
  name: string;
  enabled: boolean;
  config: {
    webhookUrl?: string;
    channel?: string;
    recipients?: string[];
  };
}

interface AlertRule {
  id: string;
  name: string;
  metric: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
  condition: 'above' | 'below';
  threshold: number;
  channels: string[];
  enabled: boolean;
}

interface AlertHistory {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: string;
  value: number;
  threshold: number;
  triggeredAt: Date;
  status: 'sent' | 'failed';
}

interface SlackEmailAlertingProps {
  userId: string;
}

export function SlackEmailAlerting({ userId }: SlackEmailAlertingProps) {
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [newChannel, setNewChannel] = useState({
    type: 'slack' as AlertChannel['type'],
    name: '',
    webhookUrl: '',
    channel: '',
    recipients: '',
  });
  const [newRule, setNewRule] = useState({
    name: '',
    metric: 'LCP' as AlertRule['metric'],
    condition: 'above' as AlertRule['condition'],
    threshold: 2500,
    channels: [] as string[],
  });
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAlertData();
  }, [userId]);

  const fetchAlertData = async () => {
    try {
      const [channelsRes, rulesRes, historyRes] = await Promise.all([
        apiFetch(`/api/users/${userId}/alert-channels`),
        apiFetch(`/api/users/${userId}/alert-rules`),
        apiFetch(`/api/users/${userId}/alert-history`),
      ]);

      if (channelsRes.ok) setChannels(await channelsRes.json());
      if (rulesRes.ok) setRules(await rulesRes.json());
      if (historyRes.ok) setHistory(await historyRes.json());
    } catch (error) {
      console.error('Failed to fetch alert data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addChannel = async () => {
    try {
      const response = await apiFetch('/api/alert-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: newChannel.type,
          name: newChannel.name,
          config: newChannel.type === 'slack'
            ? { webhookUrl: newChannel.webhookUrl, channel: newChannel.channel }
            : { recipients: newChannel.recipients.split(',').map(r => r.trim()) },
        }),
      });

      if (response.ok) {
        const channel = await response.json();
        setChannels(prev => [...prev, channel]);
        setIsAddingChannel(false);
        setNewChannel({ type: 'slack', name: '', webhookUrl: '', channel: '', recipients: '' });
      }
    } catch (error) {
      console.error('Failed to add channel:', error);
    }
  };

  const addRule = async () => {
    try {
      const response = await apiFetch('/api/alert-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: newRule.name,
          metric: newRule.metric,
          condition: newRule.condition,
          threshold: newRule.threshold,
          // no channel picked: notify every enabled channel
          channels: newRule.channels.length ? newRule.channels : channels.filter(c => c.enabled).map(c => c.id),
        }),
      });

      if (response.ok) {
        const rule = await response.json();
        setRules(prev => [...prev, rule]);
        setIsAddingRule(false);
        setNewRule({ name: '', metric: 'LCP', condition: 'above', threshold: 2500, channels: [] });
      }
    } catch (error) {
      console.error('Failed to add rule:', error);
    }
  };

  const toggleChannel = async (id: string) => {
    try {
      const response = await apiFetch(`/api/alert-channels/${id}/toggle`, {
        method: 'POST',
      });

      if (response.ok) {
        setChannels(prev =>
          prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c)
        );
      }
    } catch (error) {
      console.error('Failed to toggle channel:', error);
    }
  };

  const toggleRule = async (id: string) => {
    try {
      const response = await apiFetch(`/api/alert-rules/${id}/toggle`, {
        method: 'POST',
      });

      if (response.ok) {
        setRules(prev =>
          prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
        );
      }
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  /** Sends a test message through every enabled channel. */
  const sendTestAlert = async () => {
    const enabled = channels.filter(c => c.enabled);
    if (!enabled.length) return setTestResult('Add and enable a channel first');
    let sent = 0;
    for (const c of enabled) {
      const res = await apiFetch(`/api/alert-channels/${c.id}/test`, { method: 'POST' }).catch(() => null);
      if (res?.ok) sent++;
    }
    setTestResult(`${sent} of ${enabled.length} channel${enabled.length > 1 ? 's' : ''} received the test alert`);
  };

  if (isLoading) return <div>Loading alert configuration...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Slack/Email Alerting</h2>

      {/* Alert Channels */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Alert Channels</h3>
          <button
            onClick={() => setIsAddingChannel(!isAddingChannel)}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
          >
            {isAddingChannel ? 'Cancel' : '+ Add Channel'}
          </button>
        </div>

        {isAddingChannel && (
          <div className="space-y-3 p-3 bg-gray-50 rounded mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={newChannel.type}
                onChange={(e) => setNewChannel({ ...newChannel, type: e.target.value as AlertChannel['type'] })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="slack">Slack</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={newChannel.name}
                onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                placeholder="e.g., DevOps Team"
                className="w-full border rounded px-3 py-2"
              />
            </div>
            {newChannel.type === 'slack' ? (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Webhook URL</label>
                  <input
                    type="url"
                    value={newChannel.webhookUrl}
                    onChange={(e) => setNewChannel({ ...newChannel, webhookUrl: e.target.value })}
                    placeholder="https://hooks.slack.com/..."
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Channel</label>
                  <input
                    type="text"
                    value={newChannel.channel}
                    onChange={(e) => setNewChannel({ ...newChannel, channel: e.target.value })}
                    placeholder="#performance-alerts"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1">Recipients (comma-separated)</label>
                <input
                  type="text"
                  value={newChannel.recipients}
                  onChange={(e) => setNewChannel({ ...newChannel, recipients: e.target.value })}
                  placeholder="user1@example.com, user2@example.com"
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            )}
            <button
              onClick={addChannel}
              disabled={!newChannel.name}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              Add Channel
            </button>
          </div>
        )}

        <div className="space-y-2">
          {channels.map((channel) => (
            <div key={channel.id} className="flex items-center justify-between p-3 border rounded">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{channel.type === 'slack' ? '💬' : '📧'}</span>
                <div>
                  <p className="font-medium">{channel.name}</p>
                  <p className="text-sm text-gray-600 capitalize">{channel.type}</p>
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={channel.enabled}
                  onChange={() => toggleChannel(channel.id)}
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Alert Rules */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Alert Rules</h3>
          <button
            onClick={() => setIsAddingRule(!isAddingRule)}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
          >
            {isAddingRule ? 'Cancel' : '+ Add Rule'}
          </button>
        </div>

        {isAddingRule && (
          <div className="space-y-2 mb-3 p-3 bg-gray-50 rounded" data-testid="rule-form">
            <input
              type="text"
              value={newRule.name}
              onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
              placeholder="e.g., Slow LCP on checkout"
              className="w-full px-3 py-2 border rounded text-sm"
            />
            <div className="flex gap-2">
              <select value={newRule.metric} onChange={(e) => setNewRule({ ...newRule, metric: e.target.value as AlertRule['metric'] })} className="px-2 py-2 border rounded text-sm" aria-label="Metric">
                {['LCP', 'INP', 'CLS', 'FCP', 'TTFB'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={newRule.condition} onChange={(e) => setNewRule({ ...newRule, condition: e.target.value as AlertRule['condition'] })} className="px-2 py-2 border rounded text-sm" aria-label="Condition">
                <option value="above">above</option>
                <option value="below">below</option>
              </select>
              <input type="number" step="any" value={newRule.threshold} onChange={(e) => setNewRule({ ...newRule, threshold: Number(e.target.value) })} className="w-28 px-2 py-2 border rounded text-sm" aria-label="Threshold" />
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {channels.map((c) => (
                <label key={c.id} className="flex items-center gap-1">
                  <input type="checkbox" checked={newRule.channels.includes(c.id)} onChange={(e) => setNewRule({ ...newRule, channels: e.target.checked ? [...newRule.channels, c.id] : newRule.channels.filter((id) => id !== c.id) })} />
                  {c.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500">Checked against the 75th percentile of each upload; one notification per rule every 15 minutes at most.</p>
            <button onClick={addRule} disabled={!newRule.name} className="w-full px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300">Create Rule</button>
          </div>
        )}

        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between p-3 border rounded">
              <div>
                <p className="font-medium">{rule.name}</p>
                <p className="text-sm text-gray-600">
                  {rule.metric} {rule.condition} {rule.threshold}
                </p>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={() => toggleRule(rule.id)}
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Alert History */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Alert History</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {history.map((alert) => (
            <div key={alert.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <div>
                <p className="font-medium text-sm">{alert.ruleName}</p>
                <p className="text-xs text-gray-600">
                  {alert.metric}: {alert.value} (threshold: {alert.threshold})
                </p>
              </div>
              <div className="text-right">
                <span className={`px-2 py-1 rounded text-xs ${alert.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {alert.status}
                </span>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(alert.triggeredAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Test Alert */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Test Alert</h3>
        {testResult && <p className="mb-2 text-sm text-gray-600" role="status">{testResult}</p>}
        <button onClick={() => void sendTestAlert()} className="px-4 py-2 bg-blue-500 text-white rounded text-sm">
          Send Test Alert
        </button>
      </div>
    </div>
  );
}
