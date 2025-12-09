# Node.js 后端 + 静态前端
FROM node:20-alpine

# 安装 better-sqlite3 编译依赖
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制后端
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production && \
    # 清理编译缓存
    npm cache clean --force

COPY backend/ ./backend/

# 复制前端
COPY frontend/ ./frontend/

# 创建数据目录
RUN mkdir -p /app/backend/data

EXPOSE 3000

WORKDIR /app/backend
CMD ["node", "server.js"]
