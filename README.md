# 书签导航

一个自用书签导航页，支持分类、搜索引擎、TODO、系统监控组件、图标库、AI 辅助描述/标签，以及 JSON / WebDAV 数据备份。

## 功能

- 书签与分类管理：新增、编辑、删除、排序、折叠分类
- 搜索：网页搜索引擎切换、书签过滤、快捷搜索浮层
- 个性化：主题、Logo、壁纸、时钟、页脚、内容宽度
- TODO：快速添加、编辑、完成、删除、拖拽排序
- 系统监控：CPU、内存、磁盘组件
- 图标库：自动获取 favicon、上传/复用图标
- 数据备份：本地 JSON 导入导出、浏览器书签 HTML 导入、WebDAV 上传/下载
- AI 辅助：为书签生成标签和摘要，支持 OpenAI / Gemini / Claude
- 数据库：默认 SQLite，也支持远程 MySQL

## 快速启动

### Docker Compose（SQLite 默认）

```bash
mkdir bookmarks && cd bookmarks
curl -O https://raw.githubusercontent.com/ZJ-zhangcn/bookmarks/main/docker-compose.yml
touch .env
docker compose up -d
```

访问：`http://localhost:8080`

数据默认保存在 Docker volume `bookmark-data`。

### Docker Compose（远程 MySQL）

```bash
curl -O https://raw.githubusercontent.com/ZJ-zhangcn/bookmarks/main/docker-compose.mysql.yml
cat > .env <<'EOF'
DATABASE_URL=mysql://user:password@host:3306/bookmarks?ssl-mode=REQUIRED
EOF
docker compose -f docker-compose.mysql.yml up -d
```

### 本地开发

```bash
npm install
npm run dev
```

前端 Vite 开发服务：

```bash
npm run dev:frontend
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 后端服务端口 |
| `NODE_ENV` | `production` | 运行环境 |
| `DATABASE_URL` | - | MySQL 连接字符串；不设置则使用 SQLite |
| `HOST_PROC` | `/host/proc` | 宿主机 `/proc` 挂载路径，用于系统监控 |
| `HOST_SYS` | `/host/sys` | 宿主机 `/sys` 挂载路径，用于系统监控 |
| `ALLOW_ANONYMOUS_WRITE` | - | 允许匿名写入；个人内网使用可开启 |
| `ADMIN_TOKEN` | - | 设置后写操作需要 `Authorization: Bearer <token>` |
| `ALLOW_PRIVATE_FETCH` | - | 允许抓取内网地址，WebDAV 到 NAS 时可能需要 |
| `CORS_ORIGIN` | - | 限制允许的跨域来源，多个用逗号分隔 |

### AI 相关

| 变量 | 默认值 | 说明 |
|---|---|---|
| `AI_ENABLED` | `false` | 是否启用 AI |
| `AI_PROVIDER` | `openai` | `openai` / `gemini` / `claude` |
| `AI_MODEL` | - | 模型名 |
| `AI_BASE_URL` | - | API 基础地址 |
| `AI_TIMEOUT_MS` | `8000` | AI 请求超时 |
| `AI_MAX_TOKENS` | `280` | 推荐兼容层输出 token 上限 |
| `AI_TEMPERATURE` | `0` | 推荐兼容层采样温度；不兼容的模型会自动省略 |
| `AI_TOP_P` | - | 推荐兼容层 top_p / topP；留空则不传 |
| `AI_REASONING_EFFORT` | - | OpenAI 官方 reasoning/GPT-5 类模型的推理强度 |
| `AI_CLAUDE_THINKING` | - | Claude thinking 开关：`adaptive` / `disabled`；不支持的旧模型会自动省略 |
| `OPENAI_API_KEY` | - | OpenAI Key |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | - | Gemini Key |
| `ANTHROPIC_API_KEY` | - | Claude Key |
| `ANTHROPIC_VERSION` | `2023-06-01` | Claude API 版本头 |
| `AI_ALLOW_CLIENT_KEY` | `false` | 是否允许前端临时传入 Key |
| `AI_ALLOW_CLIENT_BASE_URL` | `false` | 是否允许前端覆盖 API 地址 |
| `AI_ALLOW_CLIENT_PROVIDER` | `false` | 是否允许前端切换 Provider |
| `AI_ALLOW_CLIENT_PARAMS` | `false` | 是否允许请求体覆盖推荐兼容层参数 |
| `AI_ALLOW_PRIVATE_BASE_URL` | `false` | 是否允许 AI 网关使用内网地址 |

AI 生成参数采用推荐兼容层：后端只暴露书签生成所需的通用参数，并自动映射为 OpenAI、Gemini、Claude 各自支持的字段，不等同于三家 API 的全量高级参数。

## 数据备份

### 本地 JSON

设置 → 数据同步：

- 导出：下载当前配置 JSON
- 导入：上传 JSON 恢复数据
- 浏览器书签导入：导入 Netscape HTML 格式书签

### WebDAV

设置 → 数据同步中填写 WebDAV 地址、账号、密码和保存路径，然后使用上传/下载按钮同步。

## 系统监控

系统监控组件依赖宿主机挂载：

```yaml
volumes:
  - /proc:/host/proc:ro
  - /sys:/host/sys:ro
environment:
  - HOST_PROC=/host/proc
  - HOST_SYS=/host/sys
```

如不使用系统监控组件，可删除 compose 中对应挂载。

## 常用脚本

```bash
npm run dev             # 启动后端，直接服务 frontend 或 dist
npm run dev:frontend    # 启动 Vite 前端开发服务
npm run build:frontend  # 构建前端到 dist
npm run lint            # 运行 ESLint
npm run lint:fix        # 自动修复 ESLint 可修复问题
npm run db:init         # 初始化 MySQL 表
npm run db:migrate      # SQLite 迁移到 MySQL
```

## 项目结构

```text
bookmarks/
├── backend/              # Express 后端
│   ├── server.js         # 服务入口
│   ├── db.js             # SQLite / MySQL 数据库层
│   ├── ai.js             # AI API
│   ├── bootstrap-v2.js   # 首屏聚合接口
│   └── routes/           # API 路由
├── frontend/             # 原生 HTML/CSS/JS 前端
│   ├── index.html
│   ├── index.css
│   ├── main.js
│   └── modules/
├── shared/services/      # 后端复用服务层
├── scripts/              # MySQL 初始化与迁移脚本
├── Dockerfile
├── docker-compose.yml
└── docker-compose.mysql.yml
```

## 说明

项目当前保留 MySQL、AI、WebDAV、TODO、系统监控、图标库和 Docker 部署；已移除 Docker 容器管理和多语言切换，界面固定为中文。
