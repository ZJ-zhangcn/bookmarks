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
RUN npm run build:frontend

# ============ 阶段二：运行时镜像 ============
FROM node:22-alpine

# 安装 better-sqlite3 编译依赖
RUN apk add --no-cache python3 make g++ ca-certificates && \
    update-ca-certificates

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

COPY backend/ ./backend/
COPY shared/ ./shared/
COPY --from=frontend-builder /app/dist ./dist/

RUN mkdir -p /app/backend/data

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

EXPOSE 3000

WORKDIR /app/backend
CMD ["node", "server.js"]
