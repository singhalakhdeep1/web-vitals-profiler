import React, { useState, useEffect } from 'react';

interface ScoreBreakdown {
  category: string;
  weight: number;
  score: number;
  impact: number;
  details: string[];
}

interface PerformanceScore {
  id: string;
  url: string;
  overallScore: number;
  breakdown: ScoreBreakdown[];
  calculatedAt: Date;
}

interface PerformanceScoringProps {
  userId: string;
}

export function PerformanceScoring({ userId }: PerformanceScoringProps) {
  const [scores, setScores] = useState<PerformanceScore[]>([]);
  const [selectedScore, setSelectedScore] = useState<PerformanceScore | null>(null);
  const [customWeights, setCustomWeights] = useState({
    speed: 40,
    accessibility: 25,
    bestPractices: 20,
    seo: 15,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchScores();
  }, [userId]);

  const fetchScores = async () => {
    try {
      const response = await fetch(`/api/users/${userId}/performance-scores`);
      if (response.ok) {
        const data = await response.json();
        setScores(data);
        if (data.length > 0) setSelectedScore(data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch scores:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateScore = async (url: string) => {
    try {
      const response = await fetch('/api/performance/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, url, weights: customWeights }),
      });

      if (response.ok) {
        const score = await response.json();
        setScores(prev => [score, ...prev]);
        setSelectedScore(score);
      }
    } catch (error) {
      console.error('Failed to calculate score:', error);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 70) return 'bg-yellow-500';
    if (score >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getScoreGrade = (score: number) => {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  };

  if (isLoading) return <div>Loading performance scores...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Performance Scoring</h2>

      {/* Score Calculator */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Calculate Score</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">URL</label>
            <input
              type="url"
              id="score-url"
              placeholder="https://example.com"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Custom Weights</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Speed ({customWeights.speed}%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={customWeights.speed}
                  onChange={(e) => setCustomWeights({ ...customWeights, speed: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Accessibility ({customWeights.accessibility}%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={customWeights.accessibility}
                  onChange={(e) => setCustomWeights({ ...customWeights, accessibility: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Best Practices ({customWeights.bestPractices}%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={customWeights.bestPractices}
                  onChange={(e) => setCustomWeights({ ...customWeights, bestPractices: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">SEO ({customWeights.seo}%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={customWeights.seo}
                  onChange={(e) => setCustomWeights({ ...customWeights, seo: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              const url = (document.getElementById('score-url') as HTMLInputElement)?.value;
              if (url) calculateScore(url);
            }}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded"
          >
            Calculate Score
          </button>
        </div>
      </div>

      {/* Score Display */}
      {selectedScore && (
        <div className="border rounded-lg p-4">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-semibold">{selectedScore.url}</h3>
              <p className="text-sm text-gray-600">
                {new Date(selectedScore.calculatedAt).toLocaleString()}
              </p>
            </div>
            <div className="text-center">
              <div className={`w-20 h-20 rounded-full ${getScoreColor(selectedScore.overallScore)} flex items-center justify-center text-white text-3xl font-bold`}>
                {getScoreGrade(selectedScore.overallScore)}
              </div>
              <p className="text-sm mt-1">{Math.round(selectedScore.overallScore)}/100</p>
            </div>
          </div>

          {/* Breakdown */}
          <div className="space-y-3">
            <h4 className="font-medium">Score Breakdown</h4>
            {selectedScore.breakdown.map((item, idx) => (
              <div key={idx} className="border rounded p-3">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <p className="font-medium">{item.category}</p>
                    <p className="text-xs text-gray-600">Weight: {item.weight}%</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{Math.round(item.score)}/100</p>
                    <p className="text-xs text-gray-600">Impact: {item.impact.toFixed(1)}</p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${getScoreColor(item.score)}`}
                    style={{ width: `${item.score}%` }}
                  />
                </div>
                {item.details.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-600 mb-1">Details:</p>
                    <ul className="text-xs text-gray-500 list-disc list-inside">
                      {item.details.map((detail, dIdx) => (
                        <li key={dIdx}>{detail}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score History */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Score History</h3>
        <div className="space-y-2">
          {scores.map((score) => (
            <div
              key={score.id}
              onClick={() => setSelectedScore(score)}
              className={`flex items-center gap-3 p-3 rounded cursor-pointer ${
                selectedScore?.id === score.id ? 'bg-blue-50 border-2 border-blue-500' : 'bg-gray-50'
              }`}
            >
              <div className={`w-10 h-10 rounded-full ${getScoreColor(score.overallScore)} flex items-center justify-center text-white font-bold`}>
                {getScoreGrade(score.overallScore)}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{score.url}</p>
                <p className="text-xs text-gray-600">{new Date(score.calculatedAt).toLocaleDateString()}</p>
              </div>
              <p className="font-bold">{Math.round(score.overallScore)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Score Presets */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Score Presets</h3>
        <div className="grid grid-cols-2 gap-2">
          <button className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
            Google Core Web Vitals
          </button>
          <button className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
            Mobile First
          </button>
          <button className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
            SEO Optimized
          </button>
          <button className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
            Accessibility Focused
          </button>
        </div>
      </div>
    </div>
  );
}
