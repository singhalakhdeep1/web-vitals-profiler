export interface MetricRecord {
  timestamp: number;
  lcp: number; // Largest Contentful Paint (ms)
  fid: number; // First Input Delay (ms)
  cls: number; // Cumulative Layout Shift
  inp: number; // Interaction to Next Paint (ms)
}

export function evaluatePerformanceRating(metric: MetricRecord): 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR' {
  if (metric.lcp <= 2500 && metric.cls <= 0.1 && metric.inp <= 200) {
    return 'GOOD';
  }
  if (metric.lcp > 4000 || metric.cls > 0.25 || metric.inp > 500) {
    return 'POOR';
  }
  return 'NEEDS_IMPROVEMENT';
}
