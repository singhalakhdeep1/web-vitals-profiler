// Vercel configuration for web vitals profiler: wraps the API handler (apps/api) as a Vercel function.
// The function uses the Node.js runtime: Firestore (firebase-admin) and Redis (TCP) are not available on the Edge
// runtime. Requests keep Vercel's geo header (x-vercel-ip-country), which the API stores with each sample.

export const config = {
  runtime: "nodejs",
  regions: ["iad1"],
  maxDuration: 60,
};

type Handler = (req: Request, info?: { ip?: string }) => Promise<Response>;

/** Turns the API's Web-standard handler into a Vercel function (default export of api/index.ts). */
export function vercelHandler(app: Handler): (request: Request) => Promise<Response> {
  return (request: Request) => app(request, { ip: request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined });
}

export default vercelHandler;
