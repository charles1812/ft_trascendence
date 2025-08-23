FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY backend/package.json backend/tsconfig.json ./backend/
COPY shared/package.json ./shared/

RUN yarn workspaces focus backend

COPY backend ./backend
COPY shared ./shared

WORKDIR /app/backend
RUN yarn build

FROM node:22-alpine AS runtime

RUN corepack enable

WORKDIR /app

COPY --from=builder /app/.yarn ./.yarn
COPY --from=builder /app/.yarnrc.yml /app/yarn.lock /app/package.json ./
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/

RUN chown -R node:node /app

USER node

RUN yarn workspaces focus backend --production

ENV NODE_ENV=production
CMD ["yarn", "workspace", "backend", "start"]
