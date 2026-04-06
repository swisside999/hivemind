FROM node:22-slim AS base

RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.json ./
COPY packages/server/ packages/server/
COPY packages/web/ packages/web/

# Build both packages
RUN pnpm build

# --- Production stage ---
FROM node:22-slim AS production

RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY --from=base /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=base /app/packages/server/package.json packages/server/
COPY --from=base /app/packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --prod

COPY --from=base /app/packages/server/dist packages/server/dist/
COPY --from=base /app/packages/server/templates packages/server/templates/
COPY --from=base /app/packages/web/dist packages/web/dist/

ENV HIVEMIND_PORT=3100
ENV HIVEMIND_LOG_LEVEL=info

EXPOSE 3100

CMD ["node", "packages/server/dist/index.js"]
