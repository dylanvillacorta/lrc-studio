# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

ARG VITE_SITE_URL=https://lrc.dirtykeras.com
ARG APP_VERSION=0.0.0
ARG APP_COMMIT=dev

ENV VITE_SITE_URL=${VITE_SITE_URL} \
    APP_VERSION=${APP_VERSION} \
    APP_COMMIT=${APP_COMMIT}

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml .npmrc pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM nginxinc/nginx-unprivileged:alpine AS runtime

ARG APP_VERSION=0.0.0
ARG APP_COMMIT=dev
ARG CREATED=1970-01-01T00:00:00Z

LABEL org.opencontainers.image.title="LyricSync Studio" \
      org.opencontainers.image.description="Aplicación web local-first para sincronización de letras LRC/ELRC y karaoke a 60 FPS" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${APP_COMMIT}" \
      org.opencontainers.image.source="https://github.com/dylanvillacorta/lrc-studio" \
      org.opencontainers.image.created="${CREATED}"

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
