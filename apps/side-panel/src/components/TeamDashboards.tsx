import { useState, useEffect } from 'react';
import { apiFetch } from '@wvp/api-client';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: Date;
}

interface Dashboard {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  /** Pages whose field data the dashboard shows. */
  urls?: string[];
  createdAt: Date;
  members: TeamMember[];
}

interface TeamDashboardsProps {
  userId: string;
}

export function TeamDashboards({ userId }: TeamDashboardsProps) {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [selectedDashboard, setSelectedDashboard] = useState<Dashboard | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [newDashboard, setNewDashboard] = useState({
    name: '',
    description: '',
    isPublic: false,
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [settings, setSettings] = useState({ urls: '', isPublic: false });
  const [summary, setSummary] = useState<{ pages: { url: string; samples: number; rating: string | null; metrics: Record<string, { p75: number; rating: string }> }[] } | null>(null);

  useEffect(() => {
    if (!selectedDashboard) return;
    setSummary(null);
    void apiFetch(`/api/team-dashboards/${selectedDashboard.id}/summary`).then(async (r) => r.ok && setSummary(await r.json()));
  }, [selectedDashboard?.id, selectedDashboard?.urls?.join(',')]);

  const saveSettings = async () => {
    if (!selectedDashboard) return;
    const urls = settings.urls.split(/\s+/).map((u) => u.trim()).filter(Boolean);
    const response = await apiFetch(`/api/team-dashboards/${selectedDashboard.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, isPublic: settings.isPublic }),
    });
    if (response.ok) {
      const updated = await response.json();
      setSelectedDashboard(updated);
      setDashboards(prev => prev.map(d => (d.id === updated.id ? updated : d)));
      setIsEditing(false);
    }
  };

  const deleteDashboard = async () => {
    if (!selectedDashboard || !confirm(`Delete the dashboard "${selectedDashboard.name}"?`)) return;
    const response = await apiFetch(`/api/team-dashboards/${selectedDashboard.id}`, { method: 'DELETE' });
    if (response.ok) {
      setDashboards(prev => prev.filter(d => d.id !== selectedDashboard.id));
      setSelectedDashboard(null);
    }
  };
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboards();
  }, [userId]);

  const fetchDashboards = async () => {
    try {
      const response = await apiFetch(`/api/users/${userId}/team-dashboards`);
      if (response.ok) {
        const data = await response.json();
        setDashboards(data);
        if (data.length > 0) setSelectedDashboard(data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch dashboards:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createDashboard = async () => {
    try {
      const response = await apiFetch('/api/team-dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...newDashboard }),
      });

      if (response.ok) {
        const dashboard = await response.json();
        setDashboards(prev => [dashboard, ...prev]);
        setSelectedDashboard(dashboard);
        setIsCreating(false);
        setNewDashboard({ name: '', description: '', isPublic: false });
      }
    } catch (error) {
      console.error('Failed to create dashboard:', error);
    }
  };

  const inviteMember = async () => {
    if (!selectedDashboard || !inviteEmail) return;

    try {
      const response = await apiFetch(`/api/team-dashboards/${selectedDashboard.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: 'member' }),
      });

      if (response.ok) {
        const member = await response.json();
        setSelectedDashboard({
          ...selectedDashboard,
          members: [...selectedDashboard.members, member],
        });
        setInviteEmail('');
        setIsInviting(false);
      }
    } catch (error) {
      console.error('Failed to invite member:', error);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!selectedDashboard) return;

    try {
      const response = await apiFetch(`/api/team-dashboards/${selectedDashboard.id}/members/${memberId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSelectedDashboard({
          ...selectedDashboard,
          members: selectedDashboard.members.filter(m => m.id !== memberId),
        });
      }
    } catch (error) {
      console.error('Failed to remove member:', error);
    }
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      owner: 'bg-purple-100 text-purple-700',
      admin: 'bg-blue-100 text-blue-700',
      member: 'bg-green-100 text-green-700',
      viewer: 'bg-gray-100 text-gray-700',
    };
    return colors[role] || colors.viewer;
  };

  if (isLoading) return <div>Loading team dashboards...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Team Dashboards</h2>

      {/* Dashboard List */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Dashboards</h3>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
          >
            {isCreating ? 'Cancel' : '+ Create Dashboard'}
          </button>
        </div>

        {isCreating && (
          <div className="space-y-3 p-3 bg-gray-50 rounded mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={newDashboard.name}
                onChange={(e) => setNewDashboard({ ...newDashboard, name: e.target.value })}
                placeholder="e.g., Marketing Team Dashboard"
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={newDashboard.description}
                onChange={(e) => setNewDashboard({ ...newDashboard, description: e.target.value })}
                placeholder="Dashboard description..."
                className="w-full border rounded px-3 py-2"
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newDashboard.isPublic}
                onChange={(e) => setNewDashboard({ ...newDashboard, isPublic: e.target.checked })}
              />
              <span className="text-sm">Public dashboard</span>
            </label>
            <button
              onClick={createDashboard}
              disabled={!newDashboard.name}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              Create Dashboard
            </button>
          </div>
        )}

        <div className="space-y-2">
          {dashboards.map((dashboard) => (
            <div
              key={dashboard.id}
              onClick={() => setSelectedDashboard(dashboard)}
              className={`flex items-center justify-between p-3 rounded cursor-pointer ${
                selectedDashboard?.id === dashboard.id ? 'bg-blue-50 border-2 border-blue-500' : 'bg-gray-50'
              }`}
            >
              <div>
                <p className="font-medium">{dashboard.name}</p>
                <p className="text-sm text-gray-600">{dashboard.members.length} members</p>
              </div>
              {dashboard.isPublic && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Public</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Dashboard Detail */}
      {selectedDashboard && (
        <div className="border rounded-lg p-4">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-semibold">{selectedDashboard.name}</h3>
              <p className="text-sm text-gray-600">{selectedDashboard.description}</p>
              <p className="text-xs text-gray-500 mt-1">
                Created {new Date(selectedDashboard.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSettings({ urls: (selectedDashboard.urls ?? []).join('\n'), isPublic: selectedDashboard.isPublic });
                  setIsEditing(!isEditing);
                }}
                className="px-3 py-1 border rounded text-sm"
              >
                Settings
              </button>
              <button onClick={() => void deleteDashboard()} className="px-3 py-1 border rounded text-sm text-red-600">Delete</button>
            </div>
          </div>

          {isEditing && (
            <div className="mb-4 space-y-2 rounded bg-gray-50 p-3" data-testid="dashboard-settings">
              <label className="block text-sm font-medium">
                Pages (one URL per line)
                <textarea value={settings.urls} onChange={(e) => setSettings({ ...settings, urls: e.target.value })} rows={3} className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.isPublic} onChange={(e) => setSettings({ ...settings, isPublic: e.target.checked })} />
                Public (read-only link without sign-in)
              </label>
              <button onClick={() => void saveSettings()} className="px-3 py-1 bg-blue-500 text-white rounded text-sm">Save settings</button>
            </div>
          )}

          {/* Field data of the dashboard's pages, from every member's browser */}
          <div className="mb-4" data-testid="dashboard-pages">
            <h4 className="mb-2 font-medium">Pages (last 7 days, p75)</h4>
            {!selectedDashboard.urls?.length ? (
              <p className="text-sm text-gray-500">Add the pages to watch under Settings.</p>
            ) : !summary ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <div className="space-y-2">
                {summary.pages.map((p) => (
                  <div key={p.url} className="rounded border p-2 text-sm">
                    <p className="truncate font-medium" title={p.url}>{p.url}</p>
                    {p.samples === 0 ? (
                      <p className="text-gray-500">No samples yet</p>
                    ) : (
                      <p className="text-gray-600">
                        {Object.entries(p.metrics).map(([m, v]) => `${m} ${m === 'CLS' ? v.p75.toFixed(3) : Math.round(v.p75) + ' ms'}`).join(' · ')} · {p.samples} samples
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Team Members */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-medium">Team Members ({selectedDashboard.members.length})</h4>
              <button
                onClick={() => setIsInviting(!isInviting)}
                className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
              >
                {isInviting ? 'Cancel' : '+ Invite'}
              </button>
            </div>

            {isInviting && (
              <div className="flex gap-2 mb-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="flex-1 border rounded px-3 py-2"
                />
                <button
                  onClick={inviteMember}
                  disabled={!inviteEmail}
                  className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
                >
                  Invite
                </button>
              </div>
            )}

            <div className="space-y-2">
              {selectedDashboard.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{member.name}</p>
                      <p className="text-xs text-gray-600">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs ${getRoleColor(member.role)}`}>
                      {member.role}
                    </span>
                    {member.role !== 'owner' && (
                      <button
                        onClick={() => removeMember(member.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dashboard Widgets */}
          <div>
            <h4 className="font-medium mb-3">Dashboard Widgets</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded p-3">
                <p className="text-sm font-medium">Performance Overview</p>
                <p className="text-xs text-gray-600">Key metrics summary</p>
              </div>
              <div className="border rounded p-3">
                <p className="text-sm font-medium">Trend Analysis</p>
                <p className="text-xs text-gray-600">Historical performance</p>
              </div>
              <div className="border rounded p-3">
                <p className="text-sm font-medium">Page Speed Comparison</p>
                <p className="text-xs text-gray-600">Side-by-side comparison</p>
              </div>
              <div className="border rounded p-3">
                <p className="text-sm font-medium">Alert Summary</p>
                <p className="text-xs text-gray-600">Recent alerts</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permissions */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Role Permissions</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between p-2 bg-gray-50 rounded">
            <span>Owner</span>
            <span className="text-gray-600">Full access</span>
          </div>
          <div className="flex justify-between p-2 bg-gray-50 rounded">
            <span>Admin</span>
            <span className="text-gray-600">Manage members, settings</span>
          </div>
          <div className="flex justify-between p-2 bg-gray-50 rounded">
            <span>Member</span>
            <span className="text-gray-600">View, edit dashboards</span>
          </div>
          <div className="flex justify-between p-2 bg-gray-50 rounded">
            <span>Viewer</span>
            <span className="text-gray-600">View only</span>
          </div>
        </div>
      </div>
    </div>
  );
}
