// WASM processor for web vitals

export async function loadVitalsWASM(modulePath: string) {
  const response = await fetch(modulePath);
  const bytes = await response.arrayBuffer();
  const module = await WebAssembly.instantiate(bytes);
  return module.instance;
}

export async function calculateCLS(instance: any, layoutShifts: number[]) {
  if (instance.exports.calculateCLS) {
    return instance.exports.calculateCLS(layoutShifts);
  }
  return layoutShifts.reduce((sum, shift) => sum + shift, 0);
}

export async function calculateLCP(instance: any, renderTimes: number[]) {
  if (instance.exports.calculateLCP) {
    return instance.exports.calculateLCP(renderTimes);
  }
  return Math.max(...renderTimes);
}

export async function calculateFID(instance: any, inputDelay: number) {
  if (instance.exports.calculateFID) {
    return instance.exports.calculateFID(inputDelay);
  }
  return inputDelay;
}

export class VitalsProcessor {
  private instance: any;

  constructor(instance: any) {
    this.instance = instance;
  }

  async processMetrics(metrics: any) {
    if (this.instance.exports.processMetrics) {
      return this.instance.exports.processMetrics(JSON.stringify(metrics));
    }
    return metrics;
  }

  async aggregateMetrics(metrics: any[]) {
    if (this.instance.exports.aggregateMetrics) {
      return this.instance.exports.aggregateMetrics(JSON.stringify(metrics));
    }
    return metrics;
  }

  async calculatePercentiles(values: number[], percentiles: number[]) {
    if (this.instance.exports.calculatePercentiles) {
      return this.instance.exports.calculatePercentiles(values, percentiles);
    }
    return percentiles.map(p => {
      const sorted = [...values].sort((a, b) => a - b);
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[index];
    });
  }
}

export async function createVitalsProcessor(modulePath: string): Promise<VitalsProcessor> {
  const instance = await loadVitalsWASM(modulePath);
  return new VitalsProcessor(instance);
}
