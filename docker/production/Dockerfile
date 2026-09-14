FROM node:24-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@11.8.0
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN node docker/production/prepare-runtime.mjs

FROM node:24-bookworm-slim AS runtime-deps
WORKDIR /runtime
RUN npm install --global pnpm@11.8.0
COPY --from=build /runtime/ ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24-bookworm-slim AS backend
ENV NODE_ENV=production
WORKDIR /runtime
COPY --from=runtime-deps --chown=node:node /runtime/ ./
USER node
CMD ["node", "apps/api/dist/server.js"]

FROM nginx:stable-alpine AS web
COPY docker/production/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist/ /usr/share/nginx/html/
