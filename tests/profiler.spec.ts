import { describe, it, expect } from 'vitest';
import { evaluatePerformanceRating } from '../packages/core/src/trend-analyzer';

describe('Web Vitals Profiler Rating Engine', () => {
  it('should categorize metrics meeting Google standards as GOOD', () => {
    const record = {
      timestamp: Date.now(),
      lcp: 1200,
      fid: 15,
      cls: 0.02,
      inp: 80,
    };
    expect(evaluatePerformanceRating(record)).toBe('GOOD');
  });

  it('should categorize poor LCP metrics as POOR', () => {
    const record = {
      timestamp: Date.now(),
      lcp: 5200,
      fid: 50,
      cls: 0.05,
      inp: 150,
    };
    expect(evaluatePerformanceRating(record)).toBe('POOR');
  });
});
