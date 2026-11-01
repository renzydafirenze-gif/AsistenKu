# Multi-stage build: compile with dev deps, ship only production deps.
FROM node:18.18.0-alpine AS build
WORKDIR /app
# openssl is required by the Prisma engines on Alpine.
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:18.18.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache openssl curl \
  && addgroup -S app && adduser -S -G app app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# `prisma generate` output lives outside the published @prisma/client package.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R app:app /app
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD curl -fsS http://127.0.0.1:4000/health || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
