/**
 * WASM vitals processor: sorting, percentiles, mean and variance for large sample sets run in WebAssembly
 * (src/vitals.wat). The module is embedded, so it loads synchronously in Node, serverless functions and extension
 * pages. Every function falls back to plain JavaScript if WebAssembly is unavailable.
 */
import { VITALS_WASM_BASE64 } from "./vitals-wasm.generated";

interface VitalsExports {
  memory: WebAssembly.Memory;
  sort(ptr: number, len: number): void;
  percentile(ptr: number, len: number, p: number): number;
  mean(ptr: number, len: number): number;
  variance(ptr: number, len: number): number;
}

let instance: VitalsExports | null | undefined;

// atob exists in browsers, workers and Node 16+
const decodeBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** The WebAssembly instance, or null when WebAssembly cannot be used here. */
export function loadVitalsWasm(): VitalsExports | null {
  if (instance !== undefined) return instance;
  try {
    const module = new WebAssembly.Module(decodeBase64(VITALS_WASM_BASE64) as BufferSource);
    instance = new WebAssembly.Instance(module).exports as unknown as VitalsExports;
  } catch {
    instance = null;
  }
  return instance;
}

export const wasmAvailable = (): boolean => loadVitalsWasm() !== null;

/** Copies values into the module's memory (growing it when needed) and returns a view over them. */
function load(wasm: VitalsExports, values: readonly number[]): Float64Array {
  const bytes = values.length * 8;
  const have = wasm.memory.buffer.byteLength;
  if (bytes > have) wasm.memory.grow(Math.ceil((bytes - have) / 65536));
  const view = new Float64Array(wasm.memory.buffer, 0, values.length);
  view.set(values);
  return view;
}

const jsPercentile = (sorted: readonly number[], p: number): number => {
  if (!sorted.length) return Number.NaN;
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] as number;
};

/** Ascending copy of the values. */
export function sortValues(values: readonly number[]): number[] {
  const wasm = loadVitalsWasm();
  if (!wasm) return [...values].sort((a, b) => a - b);
  const view = load(wasm, values);
  wasm.sort(0, values.length);
  return Array.from(view);
}

/** Several percentiles of unsorted values in one pass (nearest-rank, like CrUX). */
export function percentiles(values: readonly number[], ps: readonly number[]): number[] {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return ps.map(() => Number.NaN);
  const wasm = loadVitalsWasm();
  if (!wasm) {
    const sorted = [...clean].sort((a, b) => a - b);
    return ps.map((p) => jsPercentile(sorted, p));
  }
  load(wasm, clean);
  wasm.sort(0, clean.length);
  return ps.map((p) => wasm.percentile(0, clean.length, p));
}

export const percentile = (values: readonly number[], p: number): number => percentiles(values, [p])[0] as number;

export function mean(values: readonly number[]): number {
  if (!values.length) return Number.NaN;
  const wasm = loadVitalsWasm();
  if (!wasm) return values.reduce((s, v) => s + v, 0) / values.length;
  load(wasm, values);
  return wasm.mean(0, values.length);
}

/** Sample variance (n - 1). */
export function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const wasm = loadVitalsWasm();
  if (!wasm) {
    const m = values.reduce((s, v) => s + v, 0) / values.length;
    return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  }
  load(wasm, values);
  return wasm.variance(0, values.length);
}

/** Summary used by the API and the extension: count, mean, p50/p75/p95. */
export function summarize(values: readonly number[]): { count: number; mean: number; p50: number; p75: number; p95: number } {
  const clean = values.filter((v) => Number.isFinite(v));
  const [p50, p75, p95] = percentiles(clean, [50, 75, 95]) as [number, number, number];
  return { count: clean.length, mean: clean.length ? mean(clean) : Number.NaN, p50, p75, p95 };
}
