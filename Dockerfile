# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

ARG NEXT_PUBLIC_EXPENSE_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_EXPENSE_API_URL=${NEXT_PUBLIC_EXPENSE_API_URL}

RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --create-home app

COPY --from=build --chown=app:app /app/package.json /app/package-lock.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/server-dist ./server-dist
COPY --from=build --chown=app:app /app/database ./server-dist/database

USER app

EXPOSE 3000 3001

CMD ["npm", "run", "start:container"]
