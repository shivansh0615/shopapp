# Production image for Free Gift Progress Bar.
#
# Multi-stage build:
#   1) build  — full npm ci (includes Vite) + prisma generate + react-router build
#   2) runner — production node_modules only + build output
#
# Migrations are NOT run during image build.
# Release / deploy step (before or as a one-shot job):
#   docker run --rm -e DATABASE_URL=... <image> npm run migrate:deploy
# App container CMD starts the server only (no migrate).

FROM node:22.18-alpine AS build

RUN apk add --no-cache openssl

WORKDIR /app

# Workspace package manifests required for deterministic npm ci
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY extensions/fgpb-discount/package.json ./extensions/fgpb-discount/
COPY storefront-extension/package.json ./storefront-extension/

RUN npm ci --include=dev

COPY . .

RUN npx prisma generate
RUN npm run build:storefront
RUN npm run check:storefront-assets
RUN npm run build
# Keep only runtime dependencies after building with the supported Node version.
RUN npm prune --omit=dev

FROM node:22.18-alpine AS runner

RUN apk add --no-cache openssl wget \
  && addgroup -S nodejs \
  && adduser -S shopify -G nodejs

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build --chown=shopify:nodejs /app/package.json /app/package-lock.json ./
COPY --from=build --chown=shopify:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=shopify:nodejs /app/build ./build
COPY --from=build --chown=shopify:nodejs /app/prisma ./prisma
COPY --from=build --chown=shopify:nodejs /app/public ./public
COPY --from=build --chown=shopify:nodejs /app/extensions/fgpb-discount/package.json ./extensions/fgpb-discount/
COPY --from=build --chown=shopify:nodejs /app/storefront-extension/package.json ./storefront-extension/

USER shopify

EXPOSE 3000

# Relies on /health/live implemented by the app (no DB / Shopify).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live >/dev/null || exit 1

# Start the HTTP server only. Run migrations as a separate release step:
#   npm run migrate:deploy
CMD ["npm", "run", "start"]
