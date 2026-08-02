// Vercel configuration for web vitals profiler

export const config = {
  runtime: 'edge',
  regions: ['iad1']
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/vitals') {
    if (request.method === 'POST') {
      const body = await request.json();
      // Store vitals in Vercel KV or database
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'GET') {
      const urlParam = url.searchParams.get('url');
      // Retrieve vitals from storage
      return new Response(JSON.stringify({ vitals: [] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (path === '/api/stats') {
    const urlParam = url.searchParams.get('url');
    // Calculate and return stats
    return new Response(JSON.stringify({ stats: {} }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Not Found', { status: 404 });
}
