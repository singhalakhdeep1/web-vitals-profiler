// PageSpeed Insights API client

class PageSpeedInsightsService {
  private apiKey: string;
  private baseUrl = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyzeUrl(url: string, strategy: 'desktop' | 'mobile' = 'desktop') {
    const params = new URLSearchParams({
      url,
      key: this.apiKey,
      strategy
    });

    const response = await fetch(`${this.baseUrl}?${params}`);
    const data = await response.json();
    return data;
  }

  async getLighthouseResult(url: string, strategy: 'desktop' | 'mobile' = 'desktop') {
    const data = await this.analyzeUrl(url, strategy);
    return data.lighthouseResult;
  }

  async getMetrics(url: string, strategy: 'desktop' | 'mobile' = 'desktop') {
    const result = await this.getLighthouseResult(url, strategy);
    return {
      performance: result.categories.performance.score * 100,
      accessibility: result.categories.accessibility.score * 100,
      bestPractices: result.categories['best-practices'].score * 100,
      seo: result.categories.seo.score * 100,
      pwa: result.categories.pwa?.score * 100 || null
    };
  }

  async getCoreWebVitals(url: string, strategy: 'desktop' | 'mobile' = 'desktop') {
    const result = await this.getLighthouseResult(url, strategy);
    const audits = result.audits;

    return {
      LCP: {
        id: 'largest-contentful-paint',
        title: audits['largest-contentful-paint'].title,
        displayValue: audits['largest-contentful-paint'].displayValue,
        score: audits['largest-contentful-paint'].score
      },
      FID: {
        id: 'max-potential-fid',
        title: audits['max-potential-fid'].title,
        displayValue: audits['max-potential-fid'].displayValue,
        score: audits['max-potential-fid'].score
      },
      CLS: {
        id: 'cumulative-layout-shift',
        title: audits['cumulative-layout-shift'].title,
        displayValue: audits['cumulative-layout-shift'].displayValue,
        score: audits['cumulative-layout-shift'].score
      },
      FCP: {
        id: 'first-contentful-paint',
        title: audits['first-contentful-paint'].title,
        displayValue: audits['first-contentful-paint'].displayValue,
        score: audits['first-contentful-paint'].score
      },
      TTFB: {
        id: 'total-blocking-time',
        title: audits['total-blocking-time'].title,
        displayValue: audits['total-blocking-time'].displayValue,
        score: audits['total-blocking-time'].score
      }
    };
  }

  async getOpportunities(url: string, strategy: 'desktop' | 'mobile' = 'desktop') {
    const result = await this.getLighthouseResult(url, strategy);
    const opportunities = [];

    for (const [key, audit] of Object.entries(result.audits)) {
      if (audit.scoreDisplayMode === 'numeric' && audit.score < 1) {
        opportunities.push({
          id: key,
          title: audit.title,
          description: audit.description,
          score: audit.score,
          displayValue: audit.displayValue
        });
      }
    }

    return opportunities;
  }
}

export default PageSpeedInsightsService;
