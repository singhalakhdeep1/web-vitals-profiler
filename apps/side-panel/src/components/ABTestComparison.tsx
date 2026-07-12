import React, { useState, useEffect } from 'react';

interface ABTest {
  id: string;
  name: string;
  description: string;
  variantA: {
    name: string;
    url: string;
    sampleSize: number;
  };
  variantB: {
    name: string;
    url: string;
    sampleSize: number;
  };
  status: 'running' | 'completed' | 'paused';
  createdAt: Date;
  endedAt?: Date;
}

interface ComparisonResult {
  metric: string;
  variantAValue: number;
  variantBValue: number;
  difference: number;
  significance: number;
  winner: 'A' | 'B' | 'tie' | 'inconclusive';
}

interface ABTestComparisonProps {
  userId: string;
}

export function ABTestComparison({ userId }: ABTestComparisonProps) {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [selectedTest, setSelectedTest] = useState<ABTest | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTest, setNewTest] = useState({
    name: '',
    description: '',
    variantAName: 'Control',
    variantAUrl: '',
    variantBName: 'Variant',
    variantBUrl: '',
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTests();
  }, [userId]);

  const fetchTests = async () => {
    try {
      const response = await fetch(`/api/users/${userId}/ab-tests`);
      if (response.ok) {
        const data = await response.json();
        setTests(data);
        if (data.length > 0) {
          setSelectedTest(data[0]);
          fetchComparison(data[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch tests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchComparison = async (testId: string) => {
    try {
      const response = await fetch(`/api/ab-tests/${testId}/comparison`);
      if (response.ok) {
        const data = await response.json();
        setComparison(data);
      }
    } catch (error) {
      console.error('Failed to fetch comparison:', error);
    }
  };

  const createTest = async () => {
    try {
      const response = await fetch('/api/ab-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: newTest.name,
          description: newTest.description,
          variantA: { name: newTest.variantAName, url: newTest.variantAUrl },
          variantB: { name: newTest.variantBName, url: newTest.variantBUrl },
        }),
      });

      if (response.ok) {
        const test = await response.json();
        setTests(prev => [test, ...prev]);
        setSelectedTest(test);
        setIsCreating(false);
        setNewTest({
          name: '',
          description: '',
          variantAName: 'Control',
          variantAUrl: '',
          variantBName: 'Variant',
          variantBUrl: '',
        });
      }
    } catch (error) {
      console.error('Failed to create test:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      running: 'bg-green-100 text-green-700',
      completed: 'bg-blue-100 text-blue-700',
      paused: 'bg-yellow-100 text-yellow-700',
    };
    return colors[status] || colors.paused;
  };

  const getWinnerColor = (winner: string) => {
    const colors: Record<string, string> = {
      A: 'bg-blue-100 text-blue-700',
      B: 'bg-green-100 text-green-700',
      tie: 'bg-gray-100 text-gray-700',
      inconclusive: 'bg-yellow-100 text-yellow-700',
    };
    return colors[winner] || colors.inconclusive;
  };

  if (isLoading) return <div>Loading A/B tests...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">A/B Test Comparison</h2>

      {/* Create Test */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">A/B Tests</h3>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
          >
            {isCreating ? 'Cancel' : '+ New Test'}
          </button>
        </div>

        {isCreating && (
          <div className="space-y-3 p-3 bg-gray-50 rounded mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Test Name</label>
              <input
                type="text"
                value={newTest.name}
                onChange={(e) => setNewTest({ ...newTest, name: e.target.value })}
                placeholder="e.g., Homepage Optimization"
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={newTest.description}
                onChange={(e) => setNewTest({ ...newTest, description: e.target.value })}
                placeholder="Test description..."
                className="w-full border rounded px-3 py-2"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Variant A Name</label>
                <input
                  type="text"
                  value={newTest.variantAName}
                  onChange={(e) => setNewTest({ ...newTest, variantAName: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Variant A URL</label>
                <input
                  type="url"
                  value={newTest.variantAUrl}
                  onChange={(e) => setNewTest({ ...newTest, variantAUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Variant B Name</label>
                <input
                  type="text"
                  value={newTest.variantBName}
                  onChange={(e) => setNewTest({ ...newTest, variantBName: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Variant B URL</label>
                <input
                  type="url"
                  value={newTest.variantBUrl}
                  onChange={(e) => setNewTest({ ...newTest, variantBUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </div>
            <button
              onClick={createTest}
              disabled={!newTest.name || !newTest.variantAUrl || !newTest.variantBUrl}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              Create Test
            </button>
          </div>
        )}

        {/* Test List */}
        <div className="space-y-2">
          {tests.map((test) => (
            <div
              key={test.id}
              onClick={() => {
                setSelectedTest(test);
                fetchComparison(test.id);
              }}
              className={`flex items-center justify-between p-3 rounded cursor-pointer ${
                selectedTest?.id === test.id ? 'bg-blue-50 border-2 border-blue-500' : 'bg-gray-50'
              }`}
            >
              <div>
                <p className="font-medium">{test.name}</p>
                <p className="text-sm text-gray-600">
                  {test.variantA.name} vs {test.variantB.name}
                </p>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${getStatusColor(test.status)}`}>
                {test.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison Results */}
      {selectedTest && (
        <div className="border rounded-lg p-4">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-semibold">{selectedTest.name}</h3>
              <p className="text-sm text-gray-600">{selectedTest.description}</p>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 border rounded text-sm">Pause</button>
              <button className="px-3 py-1 border rounded text-sm">End Test</button>
            </div>
          </div>

          {/* Sample Sizes */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="border rounded p-3 text-center">
              <p className="text-sm text-gray-600">{selectedTest.variantA.name}</p>
              <p className="text-2xl font-bold">{selectedTest.variantA.sampleSize}</p>
              <p className="text-xs text-gray-500">visitors</p>
            </div>
            <div className="border rounded p-3 text-center">
              <p className="text-sm text-gray-600">{selectedTest.variantB.name}</p>
              <p className="text-2xl font-bold">{selectedTest.variantB.sampleSize}</p>
              <p className="text-xs text-gray-500">visitors</p>
            </div>
          </div>

          {/* Comparison Table */}
          <div>
            <h4 className="font-medium mb-3">Performance Comparison</h4>
            <div className="space-y-2">
              {comparison.map((result, idx) => (
                <div key={idx} className="border rounded p-3">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-medium">{result.metric}</p>
                    <span className={`px-2 py-1 rounded text-xs ${getWinnerColor(result.winner)}`}>
                      Winner: {result.winner}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">{selectedTest.variantA.name}</p>
                      <p className="font-medium">{result.variantAValue}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">{selectedTest.variantB.name}</p>
                      <p className="font-medium">{result.variantBValue}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Difference</p>
                      <p className={`font-medium ${result.difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {result.difference > 0 ? '+' : ''}{result.difference.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-gray-500">
                    <span>Statistical significance: {(result.significance * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-gray-600">Total Tests</p>
          <p className="text-2xl font-bold">{tests.length}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-gray-600">Running</p>
          <p className="text-2xl font-bold text-green-600">
            {tests.filter(t => t.status === 'running').length}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-gray-600">Completed</p>
          <p className="text-2xl font-bold text-blue-600">
            {tests.filter(t => t.status === 'completed').length}
          </p>
        </div>
      </div>
    </div>
  );
}
