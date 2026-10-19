# Web Vitals Profiler sync API (apps/api). The workspace packages are TypeScript sources run with tsx.
#   docker build -t wvp-api .
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# manifests first, so dependency layers are cached between code changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
COPY packages/firebase/package.json packages/firebase/
COPY packages/pagespeed/package.json packages/pagespeed/
COPY packages/services/package.json packages/services/
COPY packages/vercel/package.json packages/vercel/
COPY packages/wasm/package.json packages/wasm/
COPY packages/typescript-config/package.json packages/typescript-config/
RUN HUSKY=0 pnpm install --frozen-lockfile --filter "@wvp/api..." --ignore-scripts

COPY packages/core packages/core
COPY packages/firebase packages/firebase
COPY packages/pagespeed packages/pagespeed
COPY packages/services packages/services
COPY packages/vercel packages/vercel
COPY packages/wasm packages/wasm
COPY packages/typescript-config packages/typescript-config
COPY apps/api apps/api

ENV NODE_ENV=production PORT=8787
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
WORKDIR /app/apps/api
CMD ["node", "--import", "tsx", "src/server.ts"]
