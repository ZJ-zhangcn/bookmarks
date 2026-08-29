# Node.js 后端 + 静态前端（多阶段构建）

# ============ 阶段一：构建前端 ============
FROM node:22-alpine AS frontend-builder

WORKDIR /app

# better-sqlite3 is a production dependency, so a clean npm ci in the
# frontend build stage also needs native build tooling on platforms where
# no prebuilt binary is available.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY frontend/ ./frontend/
COPY shared/ ./shared/
RUN npm run build:frontend

# ============ 阶段二：构建生产依赖 ============
FROM node:22-alpine AS production-deps

# better-sqlite3 may need a native build when no matching prebuilt binary exists.
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# ============ 阶段三：运行时镜像 ============
FROM node:22-alpine

ARG APP_VERSION=1.0.0
ARG GIT_COMMIT=development
ARG BUILD_TIME
ENV APP_VERSION=$APP_VERSION \
    GIT_COMMIT=$GIT_COMMIT \
    BUILD_TIME=$BUILD_TIME

# 只保留运行时证书和 native addon 所需的 C++ 运行库
RUN apk add --no-cache ca-certificates libstdc++ && \
    update-ca-certificates

WORKDIR /app

COPY --from=production-deps /app/node_modules ./node_modules
COPY backend/ ./backend/
COPY shared/ ./shared/
COPY --from=frontend-builder /app/dist ./dist/

RUN mkdir -p /app/backend/data

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

EXPOSE 3000

WORKDIR /app/backend
CMD ["node", "server.js"]
