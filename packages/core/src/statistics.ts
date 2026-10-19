/** Statistics used by monitoring, A/B comparison and anomaly detection (heavy lifting in @wvp/wasm). */
import { mean, summarize, variance } from "@wvp/wasm";

export { summarize };

/** Regularized incomplete beta function (continued fraction), for Student's t CDF. */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function lgamma(x: number): number {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const c of cof) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value of Student's t with `df` degrees of freedom. */
export function tTestPValue(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

export interface WelchResult {
  meanA: number;
  meanB: number;
  t: number;
  df: number;
  pValue: number;
}

/** Welch's t-test for two samples with unequal variances. */
export function welchTTest(a: readonly number[], b: readonly number[]): WelchResult {
  const meanA = mean(a);
  const meanB = mean(b);
  if (a.length < 2 || b.length < 2) return { meanA, meanB, t: 0, df: 0, pValue: 1 };
  const va = variance(a) / a.length;
  const vb = variance(b) / b.length;
  if (va + vb === 0) return { meanA, meanB, t: 0, df: a.length + b.length - 2, pValue: meanA === meanB ? 1 : 0 };
  const t = (meanA - meanB) / Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  return { meanA, meanB, t, df, pValue: tTestPValue(t, df) };
}

/** z-scores of each point against the series (anomaly = |z| above the limit). */
export function anomalies<T extends { value: number }>(series: readonly T[], zLimit = 2.5): (T & { z: number })[] {
  if (series.length < 4) return [];
  const values = series.map((s) => s.value);
  const m = mean(values);
  const sd = Math.sqrt(variance(values));
  if (sd === 0) return [];
  return series.map((s) => ({ ...s, z: (s.value - m) / sd })).filter((s) => Math.abs(s.z) >= zLimit);
}
