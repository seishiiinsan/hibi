# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
# Outils de compilation pour better-sqlite3 si aucun binaire précompilé ne correspond.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm build \
 && pnpm --filter @hibi/api deploy --prod --legacy /out

FROM node:22-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/data WEB_DIR=/app/web PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /src/apps/api/dist ./dist
COPY --from=build /src/apps/web/dist ./web
# Le volume nommé hérite de ce propriétaire à sa création : l'utilisateur 1000 peut écrire la base.
RUN mkdir /data && chown 1000:1000 /data
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/manifest.webmanifest').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
