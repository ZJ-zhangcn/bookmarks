# 📖 书签导航

[![Docker Build](https://github.com/ZJ145013/bookmarks/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/ZJ145013/bookmarks/actions/workflows/docker-publish.yml)
[![GitHub release](https://img.shields.io/github/v/release/ZJ145013/bookmarks?include_prereleases)](https://github.com/ZJ145013/bookmarks/releases)
[![Docker Pulls](https://img.shields.io/badge/ghcr.io-zj145013%2Fbookmarks-blue)](https://github.com/ZJ145013/bookmarks/pkgs/container/bookmarks)
[![License](https://img.shields.io/github/license/ZJ145013/bookmarks)](LICENSE)

一个简洁美观的个人书签导航页面，支持自定义分类、搜索引擎、Docker 管理等功能。

![预览图](https://github.com/ZJ145013/bookmarks/blob/main/%E9%A2%84%E8%A7%88%E5%9B%BE.png?raw=true)

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
| 🤖 **AI 辅助（可选）** | AI 生成书签标签/摘要（建议仅在 Docker 主站开启） |
| 🌐 **多语言** | 支持简体中文、繁体中文、English |

## 🚀 快速部署

### 方式一：Vercel 部署（推荐新手）

一键部署到 Vercel，需要外部 MySQL 数据库（如 Aiven、PlanetScale）：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ZJ145013/bookmarks)

**部署步骤：**

1. 点击上方按钮，Fork 并部署到 Vercel
2. 在 Vercel 项目设置中添加环境变量：
   ```
   DATABASE_URL=mysql://用户名:密码@主机:端口/bookmarks?ssl-mode=REQUIRED
   ```
3. 初始化数据库（首次部署需要）：
   ```bash
   # 克隆项目
   git clone https://github.com/ZJ145013/bookmarks.git
   cd bookmarks

   # 安装依赖
   npm install

   # 设置环境变量并初始化
   export DATABASE_URL="你的MySQL连接字符串"
   npm run db:init
   ```
4. 重新部署 Vercel 项目

> ⚠️ **注意**：Vercel 部署不支持系统监控和 Docker 管理功能，如需这些功能请使用 Docker 部署。

---

### 方式二：Docker Compose（推荐自建服务器）

#### SQLite 模式（默认，数据存储在本地）

```bash
# 创建目录
mkdir bookmarks && cd bookmarks

# 下载 docker-compose.yml
curl -O https://raw.githubusercontent.com/ZJ145013/bookmarks/main/docker-compose.yml

# 创建环境变量文件（compose 使用 env_file: .env；SQLite 模式可留空）
touch .env

# 启动服务
docker compose up -d
```

#### MySQL 模式（多实例共享数据）

```bash
# 下载 MySQL 配置
curl -O https://raw.githubusercontent.com/ZJ145013/bookmarks/main/docker-compose.mysql.yml

# 创建 .env 并写入数据库连接（必填）
cat > .env <<'EOF'
DATABASE_URL=mysql://user:password@host:3306/bookmarks?ssl-mode=REQUIRED
EOF

# （可选）开启 AI（自用场景建议只在 Docker 主站开启）
# cat >> .env <<'EOF'
# AI_ENABLED=true
# AI_PROVIDER=openai   # openai / gemini / claude
# AI_MODEL=gpt-4o-mini
# OPENAI_API_KEY=...
# EOF

# 启动服务
docker compose -f docker-compose.mysql.yml up -d
```

访问 http://localhost:8080 即可使用。

### 方式三：Docker 命令

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

### 方式四：本地开发

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
├── api/                   # Vercel Serverless Functions
│   ├── _lib/              # 共享库
│   │   └── db.js          # MySQL 数据库连接
│   ├── bookmarks.js       # 书签 API
│   ├── categories.js      # 分类 API
│   ├── engines.js         # 搜索引擎 API
│   └── ...
├── backend/               # Docker 后端服务 (Express + SQLite/MySQL)
│   ├── server.js          # 主服务文件
│   ├── db.js              # 数据库抽象层（支持双模式）
│   ├── data/              # SQLite 数据存储
│   └── package.json
├── frontend/              # 前端页面
│   ├── index.html
│   ├── index.css
│   ├── index.js
│   └── i18n.js            # 国际化
├── scripts/               # 工具脚本
│   ├── init-mysql.js      # MySQL 初始化
│   └── migrate-to-mysql.js # SQLite → MySQL 迁移
├── .github/
│   └── workflows/         # GitHub Actions
├── Dockerfile             # Docker 构建
├── docker-compose.yml     # Docker Compose 配置
├── vercel.json            # Vercel 部署配置
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

#### Docker 部署

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `NODE_ENV` | `production` | 运行环境 |
| `HOST_PROC` | `/host/proc` | 宿主机 /proc 挂载路径 |
| `HOST_SYS` | `/host/sys` | 宿主机 /sys 挂载路径 |
| `DATABASE_URL` | - | MySQL 连接字符串（可选，不设置则使用 SQLite） |
| `AI_ENABLED` | `false` | 是否启用 AI（建议仅 Docker 主站开启） |
| `AI_PROVIDER` | `openai` | AI 提供商（支持 `openai` / `gemini` / `claude`） |
| `AI_MODEL` | - | 模型名（不同 Provider 不同，如 `gpt-4o-mini` / `gemini-1.5-flash` / `claude-3-5-sonnet-latest`） |
| `AI_BASE_URL` | - | API 基础地址（按 Provider 自动默认；也可统一覆盖） |
| `AI_TIMEOUT_MS` | `8000` | AI 调用超时（毫秒） |
| `AI_SYSTEM_PROMPT` | - | 覆盖内置系统提示词（建议保持“两行输出 tags/summary”的规则，否则解析可能失败） |
| `AI_ALLOW_CLIENT_KEY` | `false` | 是否允许前端传入 Key（自用场景可选，不建议对外站点开启） |
| `AI_ALLOW_CLIENT_BASE_URL` | `false` | 是否允许前端覆盖 API 地址（自用场景可选） |
| `AI_ALLOW_CLIENT_PROVIDER` | `false` | 是否允许前端覆盖 Provider（自用场景可选） |
| `AI_ALLOW_PRIVATE_BASE_URL` | `false` | 是否允许内网/本地 API 地址（如 `http://localhost:11434`） |
| `OPENAI_API_KEY` | - | OpenAI Key（仅在部署平台配置，不写入仓库） |
| `GEMINI_API_KEY` | - | Gemini Key（Google Generative Language API Key） |
| `ANTHROPIC_API_KEY` | - | Claude Key（Anthropic API Key） |
| `ANTHROPIC_VERSION` | `2023-06-01` | Claude API 版本头（一般不用改） |

#### Vercel 部署

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | MySQL 连接字符串，格式：`mysql://user:pass@host:port/bookmarks?ssl-mode=REQUIRED` |
| `AI_ENABLED` | ❌ | 建议保持关闭（Vercel 免费计划可能受执行时长/资源限制影响） |

## 🤖 AI 辅助（可选）

当前已内置一个最小可用的 AI 能力：在“添加/编辑书签”弹窗里，支持一键生成“描述/标签”。

注意事项：
- Docker 主站：推荐开启（自用场景更稳定，且不受 Vercel 免费计划限制）
- Vercel 备用站：推荐默认关闭（保持核心导航可用即可）
- 自定义 API / Key / Model：在「设置 → 数据同步 → AI 设置」填写并保存到本浏览器（localStorage）
  - 若要让前端传入 Key：需服务端设置 `AI_ALLOW_CLIENT_KEY=true`
  - 若要让前端覆盖 API 地址：需服务端设置 `AI_ALLOW_CLIENT_BASE_URL=true`
  - 若要让前端切换 Provider：需服务端设置 `AI_ALLOW_CLIENT_PROVIDER=true`
  - 若要使用内网/本地地址（如 Ollama）：还需设置 `AI_ALLOW_PRIVATE_BASE_URL=true`

相关接口（两种部署形态共用）：
- `GET /api/ai?action=status`
- `POST /api/ai?action=generate`
- `GET /api/ai?action=bookmark&id=...`
- `POST /api/ai?action=bookmark`

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

| 部署方式 | 前端 | 后端 | 数据库 |
|---------|------|------|--------|
| **Docker (默认)** | 原生 HTML/CSS/JS | Express | SQLite |
| **Docker (MySQL)** | 原生 HTML/CSS/JS | Express | MySQL |
| **Vercel** | 原生 HTML/CSS/JS | Serverless Functions | MySQL |

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
