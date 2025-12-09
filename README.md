# 📖 书签导航

[![Docker Build](https://github.com/ZJ145013/bookmarks/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/ZJ145013/bookmarks/actions/workflows/docker-publish.yml)
[![GitHub release](https://img.shields.io/github/v/release/ZJ145013/bookmarks?include_prereleases)](https://github.com/ZJ145013/bookmarks/releases)
[![Docker Pulls](https://img.shields.io/badge/ghcr.io-zj145013%2Fbookmarks-blue)](https://github.com/ZJ145013/bookmarks/pkgs/container/bookmarks)
[![License](https://img.shields.io/github/license/ZJ145013/bookmarks)](LICENSE)

一个简洁美观的个人书签导航页面，支持自定义分类、搜索引擎、Docker 管理等功能。

![预览图](https://via.placeholder.com/800x450?text=书签导航预览图)

## ✨ 功能特点

| 功能 | 描述 |
|------|------|
| 🔖 **书签管理** | 支持分类、拖拽排序、自动获取图标 |
| 🔍 **多搜索引擎** | 可自定义搜索引擎，快速切换 |
| 🎨 **个性化设置** | 自定义 LOGO、壁纸、时钟等 |
| 📊 **系统监控** | CPU、内存、磁盘使用率组件 |
| 🐳 **Docker 管理** | 查看和控制 Docker 容器状态 |
| ☁️ **数据同步** | 支持本地导入导出和 WebDAV 云同步 |
| 🖼️ **图标库** | 自动缓存图标，可复用 |
| 🌐 **多语言** | 支持简体中文、繁体中文、English |

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
├── backend/               # 后端服务 (Express + SQLite)
│   ├── server.js          # 主服务文件
│   ├── data/              # 数据存储目录
│   └── package.json
├── frontend/              # 前端页面
│   ├── index.html
│   ├── index.css
│   ├── index.js
│   └── i18n.js            # 国际化
├── .github/
│   └── workflows/         # GitHub Actions
│       └── docker-publish.yml
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

| 功能 | 挂载 | 说明 |
|------|------|------|
| Docker 管理 | `/var/run/docker.sock` | 查看和控制容器 |
| 系统监控 | `/proc`、`/sys` | CPU、内存、磁盘监控 |

如不需要这些功能，可删除对应的 volume 挂载。

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `NODE_ENV` | `production` | 运行环境 |
| `HOST_PROC` | `/host/proc` | 宿主机 /proc 挂载路径 |
| `HOST_SYS` | `/host/sys` | 宿主机 /sys 挂载路径 |

## 🔄 数据备份与恢复

### 方式一：WebDAV 云同步

在设置 → 数据同步中配置 WebDAV 服务器（如坚果云），即可实现云端备份。

### 方式二：本地导出

在设置 → 数据同步中点击"导出"，下载 JSON 配置文件。

### 方式三：备份 Docker Volume

```bash
# 备份
docker run --rm -v bookmark-data:/data -v $(pwd):/backup alpine tar czf /backup/bookmark-backup.tar.gz -C /data .

# 恢复
docker run --rm -v bookmark-data:/data -v $(pwd):/backup alpine tar xzf /backup/bookmark-backup.tar.gz -C /data
```

## 🛠️ 技术栈

- **前端**：原生 HTML/CSS/JavaScript
- **后端**：Node.js + Express
- **数据库**：SQLite (better-sqlite3)
- **容器化**：Docker + GitHub Actions

## 📝 更新日志

### v1.0.0
- 初始版本发布
- 书签管理、分类、搜索引擎
- 个性化设置、系统监控
- Docker 管理、数据同步

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 开源协议

[MIT License](LICENSE)
