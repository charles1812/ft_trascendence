FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY frontend/package.json frontend/tsconfig.json ./frontend/
COPY shared/package.json ./shared/

RUN yarn workspaces focus frontend

COPY frontend ./frontend
COPY shared ./shared

WORKDIR /app/frontend
RUN yarn build

FROM quay.io/nginx/nginx-unprivileged:stable-alpine AS runtime

USER root

RUN apk add --no-cache openssl

USER nginx

COPY frontend/default.conf.template /etc/nginx/templates/

COPY frontend/generate-certs.sh /docker-entrypoint.d/50-generate-certs.sh
RUN mkdir /etc/nginx/certs
RUN chown nginx:nginx /etc/nginx/certs

WORKDIR /usr/share/nginx/html

COPY --from=builder --chown=nginx:nginx /app/frontend/dist ./
