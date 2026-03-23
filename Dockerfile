# Node.js 后端 + 静态前端（多阶段构建）

# ============ 阶段一：构建前端 ============
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# 复制前端和构建配置
COPY frontend/ ./frontend/
COPY package*.json ./

# 安装 vite 并构建
RUN npm install vite --save-dev && \
    npm run build:frontend

# ============ 阶段二：运行时镜像 ============
FROM node:20-alpine

# 安装 better-sqlite3 编译依赖
RUN apk add --no-cache python3 make g++ ca-certificates && \
    update-ca-certificates

WORKDIR /app

# 复制后端 package.json 并安装依赖
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --production && \
    npm cache clean --force

# 复制后端代码
COPY backend/ ./

# 复制共享模块
WORKDIR /app
COPY shared/ ./shared/

# 从构建阶段复制前端产物
COPY --from=frontend-builder /app/dist ./dist/

# 创建数据目录
RUN mkdir -p /app/backend/data

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

EXPOSE 3000

WORKDIR /app/backend
CMD ["node", "server.js"]
