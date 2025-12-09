# 📖 书签导航

一个简洁美观的个人书签导航页面，支持自定义分类、搜索引擎、Docker 管理等功能。

## ✨ 功能特点

- 🔖 **书签管理** - 支持分类、拖拽排序、自动获取图标
- 🔍 **多搜索引擎** - 可自定义搜索引擎，快速切换
- 🎨 **个性化设置** - 自定义 LOGO、壁纸、时钟等
- 📊 **系统监控** - CPU、内存、磁盘使用率组件
- 🐳 **Docker 管理** - 查看和控制 Docker 容器
- ☁️ **数据同步** - 支持本地导入导出和 WebDAV 云同步
- 🖼️ **图标库** - 自动缓存图标，可复用

## 🚀 快速部署

### 使用 Docker Compose（推荐）

```bash
# 创建目录
mkdir bookmarks && cd bookmarks

# 下载 docker-compose.yml
curl -O https://raw.githubusercontent.com/ZJ145013/bookmarks/main/docker-compose.yml

# 启动服务
docker compose up -d
```

访问 http://localhost:8080 即可使用。

### 使用 Docker 命令

```bash
docker run -d \
  --name bookmark-nav \
  -p 8080:3000 \
  -v bookmark-data:/app/backend/data \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /proc:/host/proc:ro \
  -e HOST_PROC=/host/proc \
  --restart unless-stopped \
  ghcr.io/zj145013/bookmarks:latest
```

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/ZJ145013/bookmarks.git
cd bookmarks

# 安装依赖
cd backend && npm install

# 启动服务
npm start
```

## 📁 项目结构

```
bookmarks/
├── backend/           # 后端服务 (Express + SQLite)
│   ├── server.js      # 主服务文件
│   ├── data/          # 数据存储目录
│   └── package.json
├── frontend/          # 前端页面
│   ├── index.html
│   ├── index.css
│   ├── index.js
│   └── i18n.js
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## ⚙️ 配置说明

### 端口映射

默认映射到 8080 端口，可在 `docker-compose.yml` 中修改：

```yaml
ports:
  - "你的端口:3000"
```

### 数据持久化

数据存储在 Docker volume `bookmark-data` 中，包括：
- 书签数据
- 分类数据
- 搜索引擎配置
- 个性化设置

### 可选功能

- **Docker 管理**：需要挂载 `/var/run/docker.sock`
- **系统监控**：需要挂载 `/proc` 和 `/sys`

如不需要这些功能，可删除对应的 volume 挂载。

## 📄 开源协议

MIT License
