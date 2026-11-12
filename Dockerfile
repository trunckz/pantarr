# Pantarr: one image, the API serves the web app. Build: docker build -t pantarr .
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/connector-sdk/package.json packages/connector-sdk/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY . .
# a package whose version differs from the one hoisted to the root (nodemailer 10 for the API) lands in the
# workspace's own node_modules: kept too (the folder may not exist)
RUN npm run build && npm prune --omit=dev --no-audit --no-fund && mkdir -p apps/api/node_modules

FROM node:22-alpine
RUN apk add --no-cache openssl tini
WORKDIR /app
ENV NODE_ENV=production PORT=9925
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/packages/connector-sdk/package.json ./packages/connector-sdk/
COPY --from=build /src/packages/connector-sdk/dist ./packages/connector-sdk/dist
COPY --from=build /src/apps/api/package.json ./apps/api/
COPY --from=build /src/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /src/apps/api/dist ./apps/api/dist
COPY --from=build /src/apps/api/prisma ./apps/api/prisma
COPY --from=build /src/apps/web/dist ./apps/web/dist
USER node
WORKDIR /app/apps/api
EXPOSE 9925
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:9925/api/v1/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
