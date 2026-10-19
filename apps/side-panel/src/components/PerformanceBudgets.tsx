import { useState, useEffect } from 'react';
import { apiFetch } from '@wvp/api-client';

interface Budget {
  id: string;
  name: string;
  metric: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB' | 'TBT';
  threshold: number;
  unit: 'ms' | 'score';
  status: 'passing' | 'failing' | 'warning';
  currentValue: number;
  lastChecked: Date;
}

interface PerformanceBudgetsProps {
  userId: string;
}

export function PerformanceBudgets({ userId }: PerformanceBudgetsProps) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newBudget, setNewBudget] = useState({
    name: '',
    metric: 'LCP' as Budget['metric'],
    threshold: 2500,
    unit: 'ms' as Budget['unit'],
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchBudgets();
  }, [userId]);

  const fetchBudgets = async () => {
    try {
      const response = await apiFetch(`/api/users/${userId}/performance-budgets`);
      if (response.ok) {
        const data = await response.json();
        setBudgets(data);
      }
    } catch (error) {
      console.error('Failed to fetch budgets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createBudget = async () => {
    try {
      const response = await apiFetch('/api/performance-budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...newBudget }),
      });

      if (response.ok) {
        const budget = await response.json();
        setBudgets(prev => [budget, ...prev]);
        setIsCreating(false);
        setNewBudget({ name: '', metric: 'LCP', threshold: 2500, unit: 'ms' });
      }
    } catch (error) {
      console.error('Failed to create budget:', error);
    }
  };

  const deleteBudget = async (id: string) => {
    try {
      const response = await apiFetch(`/api/performance-budgets/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setBudgets(prev => prev.filter(b => b.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete budget:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      passing: 'bg-green-100 text-green-700',
      failing: 'bg-red-100 text-red-700',
      warning: 'bg-yellow-100 text-yellow-700',
    };
    return colors[status] || colors.warning;
  };

  const getMetricLabel = (metric: string) => {
    const labels: Record<string, string> = {
      LCP: 'Largest Contentful Paint',
      INP: 'Interaction to Next Paint',
      CLS: 'Cumulative Layout Shift',
      FCP: 'First Contentful Paint',
      TTFB: 'Time to First Byte',
      TBT: 'Total Blocking Time',
    };
    return labels[metric] || metric;
  };

  if (isLoading) return <div>Loading performance budgets...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Performance Budgets</h2>

      {/* Create Budget */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Budgets</h3>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
          >
            {isCreating ? 'Cancel' : '+ Add Budget'}
          </button>
        </div>

        {isCreating && (
          <div className="space-y-3 p-3 bg-gray-50 rounded mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={newBudget.name}
                onChange={(e) => setNewBudget({ ...newBudget, name: e.target.value })}
                placeholder="e.g., LCP Budget"
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Metric</label>
              <select
                value={newBudget.metric}
                onChange={(e) => setNewBudget({ ...newBudget, metric: e.target.value as Budget['metric'] })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="LCP">Largest Contentful Paint (LCP)</option>
                <option value="INP">Interaction to Next Paint (INP)</option>
                <option value="CLS">Cumulative Layout Shift (CLS)</option>
                <option value="FCP">First Contentful Paint (FCP)</option>
                <option value="TTFB">Time to First Byte (TTFB)</option>
                <option value="TBT">Total Blocking Time (TBT)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Threshold</label>
                <input
                  type="number"
                  value={newBudget.threshold}
                  onChange={(e) => setNewBudget({ ...newBudget, threshold: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Unit</label>
                <select
                  value={newBudget.unit}
                  onChange={(e) => setNewBudget({ ...newBudget, unit: e.target.value as Budget['unit'] })}
                  className="border rounded px-3 py-2"
                >
                  <option value="ms">ms</option>
                  <option value="score">score</option>
                </select>
              </div>
            </div>
            <button
              onClick={createBudget}
              disabled={!newBudget.name}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              Create Budget
            </button>
          </div>
        )}

        {/* Budget List */}
        <div className="space-y-3">
          {budgets.map((budget) => (
            <div key={budget.id} className="border rounded p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-medium">{budget.name}</h4>
                  <p className="text-sm text-gray-600">{getMetricLabel(budget.metric)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs ${getStatusColor(budget.status)}`}>
                    {budget.status}
                  </span>
                  <button
                    onClick={() => deleteBudget(budget.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Current: {budget.currentValue}{budget.unit}</span>
                    <span className="text-gray-600">Budget: {budget.threshold}{budget.unit}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        budget.status === 'passing' ? 'bg-green-500' :
                        budget.status === 'failing' ? 'bg-red-500' : 'bg-yellow-500'
                      }`}
                      style={{
                        width: `${Math.min((budget.currentValue / budget.threshold) * 100, 100)}%`
                      }}
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Last checked: {new Date(budget.lastChecked).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Budget Templates */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Quick Templates</h3>
        <div className="grid grid-cols-2 gap-2">
          <button className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
            Core Web Vitals (Good)
          </button>
          <button className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
            Core Web Vitals (Needs Improvement)
          </button>
          <button className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
            Mobile Optimized
          </button>
          <button className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
            Desktop Optimized
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-gray-600">Passing</p>
          <p className="text-2xl font-bold text-green-600">
            {budgets.filter(b => b.status === 'passing').length}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-gray-600">Warning</p>
          <p className="text-2xl font-bold text-yellow-600">
            {budgets.filter(b => b.status === 'warning').length}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-gray-600">Failing</p>
          <p className="text-2xl font-bold text-red-600">
            {budgets.filter(b => b.status === 'failing').length}
          </p>
        </div>
      </div>
    </div>
  );
}
