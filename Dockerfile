# Node.js 后端 + 静态前端
FROM node:20-alpine

# 安装 better-sqlite3 编译依赖
# 使用 --no-cache 并分步执行以提高跨平台构建稳定性
RUN apk update && \
    apk add --no-cache python3 && \
    apk add --no-cache make && \
    apk add --no-cache g++

WORKDIR /app

# 复制后端 package.json
COPY backend/package*.json ./backend/

# 安装依赖
WORKDIR /app/backend
RUN npm install --production && \
    npm cache clean --force

# 复制后端代码
COPY backend/ ./

# 复制前端
WORKDIR /app
COPY frontend/ ./frontend/

# 创建数据目录
RUN mkdir -p /app/backend/data

EXPOSE 3000

WORKDIR /app/backend
CMD ["node", "server.js"]
