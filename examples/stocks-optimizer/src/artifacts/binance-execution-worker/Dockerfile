FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/tsconfig.base.json src/tsconfig.base.json
COPY src/artifacts/binance-execution-worker/package.json src/artifacts/binance-execution-worker/package.json

RUN pnpm install --frozen-lockfile --filter @workspace/binance-execution-worker

COPY src/artifacts/api-server/src/modules/binance-execution src/artifacts/api-server/src/modules/binance-execution
COPY src/artifacts/binance-execution-worker src/artifacts/binance-execution-worker

RUN pnpm --filter @workspace/binance-execution-worker build

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["pnpm", "--filter", "@workspace/binance-execution-worker", "start"]
