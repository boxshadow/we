# ============================================================
# Stage 1: Build NestJS application
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY admin/package.json ./admin/
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

RUN npx prisma generate
RUN pnpm run build
RUN pnpm run build:wc

# ============================================================
# Stage 2: Production runtime image
# ============================================================
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl

ENV NODE_ENV=production \
    PORT=3000

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY admin/package.json ./admin/
COPY prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY data ./data

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:3000/api/transfer/workflow/reconciliation/status || exit 1

CMD ["node", "--enable-source-maps", "dist/main.js"]
