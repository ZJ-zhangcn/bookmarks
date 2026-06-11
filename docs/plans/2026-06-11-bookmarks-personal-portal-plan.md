# Bookmarks 个人入口页 / 运维入口页改造实施计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 将 `bookmark-nav` 从“书签导航”升级为手机可用、可安装到桌面、质量可回归、并能展示个人服务健康状态的个人入口页。

**Architecture:** 先补测试与构建质量，再做真实首屏减负和 PWA，最后添加轻量服务状态面板。后端继续保持 Express + SQLite，前端保持原生模块/Vite，不引入重型框架，避免把项目改复杂。

**Tech Stack:** Node.js >= 20.19、Express、SQLite/better-sqlite3、Vite、原生 ES Modules、Node `node:test`、Service Worker、Web App Manifest。

---

## 0. 当前基线

本计划基于当前本地仓库：

```text
项目路径：/Users/zhangjin/Desktop/projects/bookmarks
当前 HEAD：0105d17 fix: 修复 Google 图标代理路由不匹配问题
```

已验证：

```text
npm test：0 个测试，不具备质量保障
npm run lint：通过
npm run build:frontend：通过，但仍有动态 import 警告
npm run audit:high：0 vulnerabilities
```

主要问题：

1. `tests/` 已删除，`npm test` 实际没有测试覆盖。
2. `api.js`、`render.js`、`ai.js`、`settings.js` 同时被静态和动态 import，懒加载没有真正拆包。
3. 虚拟滚动存在，但真实页面里可能仍渲染过多卡片。
4. 图标代理需要保留新旧路径兼容，避免旧前端或外部调用拿到 SPA HTML。
5. 移动端已改善，但还缺 PWA、命令面板、快捷新增等入口页体验。
6. 项目可以继续向“个人服务入口 / 运维入口页”演进。

---

## 1. 改造原则

- **先稳后强：** 先恢复测试、CI、兼容性，再做功能。
- **少引依赖：** 不上 React/Vue，不引复杂状态库。
- **PWA 优先移动端：** 手机桌面入口、弱网/离线可打开，比继续堆桌面 UI 更有收益。
- **运维面板轻量化：** 只展示健康状态、延迟、最后检查时间，不做完整监控系统。
- **功能可关闭：** 服务状态、AI、WebDAV、TODO 都应保持可选，不影响纯书签导航。
- **每步可回滚：** 每个任务单独提交，避免大爆炸式重构。

---

## 2. 目标版本划分

### Milestone A：稳定地基版

验收标准：

- `npm test` 至少恢复核心 API/工具测试。
- `npm run lint` 通过。
- `npm run build:frontend` 通过。
- 图标代理新旧路径都返回正确 JSON/图片/错误，不再误回首页 HTML。
- Bootstrap 缓存在写操作后可被验证清理。

### Milestone B：性能与移动版

验收标准：

- Vite 动态 import 警告消失或显著减少。
- 首屏 JS 比当前 `114.53 kB raw / 31.61 kB gzip` 有可观下降。
- 虚拟滚动在 500+ 书签时 DOM 卡片数明显少于总数。
- 移动端核心操作：搜索、打开、添加、编辑都可用。

### Milestone C：PWA 入口版

验收标准：

- 手机浏览器可“添加到主屏幕”。
- 离线时可打开应用壳和最近缓存数据。
- 有 `manifest.webmanifest`、Service Worker、离线兜底。

### Milestone D：个人运维入口版

验收标准：

- 可配置服务列表。
- 页面展示服务 HTTP 状态、延迟、最近检查时间。
- 后端接口不会泄露敏感环境变量。
- 服务状态异常时有清晰视觉提示。

---

## 3. 任务拆分

### Task 1：建立改造分支与基线记录

**Objective:** 创建独立分支，记录当前构建、测试、体积基线，便于后续对比。

**Files:**

- Create: `docs/plans/2026-06-11-bookmarks-personal-portal-plan.md`
- Modify: none

**Steps:**

1. 创建分支：

```bash
git checkout -b feat/personal-portal-pwa
```

2. 记录当前状态：

```bash
git status --short --branch
git --no-pager log --oneline -5
npm test
npm run lint
npm run build:frontend
npm run audit:high
```

3. 保存构建产物体积：

```bash
find dist -type f -maxdepth 3 -print0 | xargs -0 ls -lh
```

**Expected:**

- `lint` 通过。
- `build:frontend` 通过，但存在动态 import 警告。
- `npm test` 显示 0 tests，此为待修复基线。

**Commit:**

```bash
git add docs/plans/2026-06-11-bookmarks-personal-portal-plan.md
git commit -m "docs: add personal portal implementation plan"
```

---

### Task 2：恢复测试目录与最小测试脚手架

**Objective:** 让 `npm test` 不再是 0 tests，恢复最低限度质量保障。

**Files:**

- Create: `tests/helpers/test-server.js`
- Create: `tests/health.test.js`
- Modify: `package.json`

**Implementation Notes:**

优先用 Node 内置测试框架，不引 Jest/Vitest。

`package.json` 当前：

```json
"test": "node --test tests/*.test.js"
```

建议改为：

```json
"test": "node --test tests/**/*.test.js"
```

新增最小 health 测试，先保证测试框架可运行。

**Verification:**

```bash
npm test
```

Expected:

```text
pass >= 1
fail 0
```

**Commit:**

```bash
git add package.json tests
git commit -m "test: restore node test scaffold"
```

---

### Task 3：补 Bootstrap 缓存测试

**Objective:** 验证 `/api/bootstrap-v2` 的 MISS/HIT，以及写操作后缓存清理。

**Files:**

- Create: `tests/bootstrap-v2.test.js`
- Potentially Modify: `backend/bootstrap-v2.js`
- Potentially Modify: `backend/server.js`

**Test Cases:**

1. 第一次请求 `/api/bootstrap-v2` 返回 `X-Cache: MISS`。
2. 第二次请求返回 `X-Cache: HIT`。
3. `POST /api/bookmarks` 成功后再次请求应不继续使用旧缓存。
4. AI 写入若会影响 `bookmark_ai`，应确认是否需要清理 bootstrap 缓存。

**Verification:**

```bash
npm test -- tests/bootstrap-v2.test.js
npm run lint
```

**Commit:**

```bash
git add tests/bootstrap-v2.test.js backend/bootstrap-v2.js backend/server.js
git commit -m "test: cover bootstrap cache invalidation"
```

---

### Task 4：补图标服务与代理兼容测试

**Objective:** 防止 `/api/proxy-icon`、`/api/icon/proxy`、`/api/favicon` 回归。

**Files:**

- Create: `tests/icon-proxy.test.js`
- Modify: `backend/server.js`
- Modify: `backend/routes/icon-unified.js`
- Modify: `backend/utils/icon-proxy.js`

**Required Behaviors:**

- `POST /api/favicon` 返回 JSON，不抛 500。
- `GET /api/proxy-icon?url=...` 不应落到 SPA fallback。
- `GET /api/icon/proxy?url=...` 作为旧路径兼容。
- 非法 URL 返回 JSON 错误或透明兜底，不返回 `index.html`。
- Google favicon 的 `404 + image/png` 兼容策略需要明确：
  - 若 body 是图片，可透传；
  - 若不是图片，返回合理错误。

**Verification:**

```bash
npm test -- tests/icon-proxy.test.js
npm run lint
```

**Commit:**

```bash
git add tests/icon-proxy.test.js backend/server.js backend/routes/icon-unified.js backend/utils/icon-proxy.js
git commit -m "fix: keep icon proxy paths compatible"
```

---

### Task 5：拆分前端 API 模块，消除假动态 import

**Objective:** 将 `frontend/modules/api.js` 拆分为核心 API 与高级功能 API，让动态 import 真正产生 chunk。

**Files:**

- Modify: `frontend/modules/api.js`
- Create: `frontend/modules/api-core.js`
- Create: `frontend/modules/api-settings.js`
- Create: `frontend/modules/api-ai.js`
- Create: `frontend/modules/api-icons.js`
- Modify: `frontend/main.js`
- Modify: `frontend/modules/bookmark.js`
- Modify: `frontend/modules/category.js`
- Modify: `frontend/modules/engine.js`
- Modify: `frontend/modules/events.js`
- Modify: `frontend/modules/render.js`
- Modify: `frontend/modules/settings.js`
- Modify: `frontend/modules/todo.js`

**Rules:**

- 首屏只允许静态 import `api-core.js`。
- 设置、AI、图标库、WebDAV、TODO 按需 import。
- `api.js` 可临时保留为兼容 re-export，但主入口不得再静态引用它。

**Verification:**

```bash
npm run build:frontend
```

Expected:

- 不再出现 `api.js dynamically imported ... but also statically imported`。
- 产生多个 chunk，首屏 JS 下降。

**Commit:**

```bash
git add frontend/modules frontend/main.js
git commit -m "refactor: split frontend api modules for real lazy loading"
```

---

### Task 6：设置、AI、WebDAV、图标库真正按需加载

**Objective:** 减少首屏加载模块，把高级面板从首屏路径移出。

**Files:**

- Modify: `frontend/main.js`
- Modify: `frontend/modules/events.js`
- Modify: `frontend/modules/settings.js`
- Modify: `frontend/modules/ai.js`
- Modify: `frontend/modules/icon-library.js`
- Modify: `frontend/modules/webdav-helpers.cjs` if needed

**Approach:**

- 设置按钮点击后再 import `settings.js`。
- AI 操作按钮点击后再 import `ai.js`。
- 图标库面板点击后再 import `icon-library.js`。
- WebDAV 设置进入时再加载相关 helper。

**Verification:**

```bash
npm run build:frontend
npm run lint
```

Expected:

- `settings.js`、`ai.js` 不再出现在首屏主 chunk 中。
- 动态 import 警告减少或消失。

**Commit:**

```bash
git add frontend
git commit -m "perf: lazy load advanced panels"
```

---

### Task 7：修正虚拟滚动容器

**Objective:** 让虚拟滚动真正减少 DOM 数量，而不是渲染全部书签。

**Files:**

- Modify: `frontend/modules/virtual-scroll.js`
- Modify: `frontend/modules/render.js`
- Modify: `frontend/index.css`
- Potentially Modify: `frontend/test-virtual-scroll.html`

**Acceptance Criteria:**

测试 500 个书签时：

- 页面可滚动。
- `.bookmark-card` DOM 数量明显少于 500，例如小于 80。
- 滚动到底部后能看到最后一批书签。
- 搜索/分类切换后位置和渲染正常。

**Implementation Direction:**

优先使用明确滚动视口：

```css
.bookmarks-grid.virtualized {
  height: min(70vh, calc(100vh - 260px));
  overflow-y: auto;
}
```

如果这会破坏页面布局，则改为基于页面主滚动容器计算可视区域。

**Verification:**

```bash
npm run build:frontend
npm run lint
```

再用浏览器或 Playwright/CDP 做一次 DOM 数量检查。

**Commit:**

```bash
git add frontend/modules/virtual-scroll.js frontend/modules/render.js frontend/index.css frontend/test-virtual-scroll.html
git commit -m "perf: make virtual scroll reduce rendered cards"
```

---

### Task 8：新增命令面板 Cmd+K / /

**Objective:** 把 bookmarks 从“点卡片”升级为快速入口。

**Files:**

- Create: `frontend/modules/command-palette.js`
- Modify: `frontend/modules/events.js`
- Modify: `frontend/index.css`
- Modify: `frontend/index.html` if needed

**Features:**

命令面板支持：

- 搜书签。
- 搜分类。
- 搜搜索引擎。
- 快速打开设置。
- 快速新增书签。
- 快速进入 TODO。

快捷键：

- `Cmd+K` / `Ctrl+K` 打开。
- `/` 聚焦搜索或打开命令面板。
- `Esc` 关闭。
- 上下键选择，回车执行。

**Verification:**

```bash
npm run lint
npm run build:frontend
```

手测：

- 桌面键盘操作正常。
- 移动端不误触发快捷键。

**Commit:**

```bash
git add frontend/modules/command-palette.js frontend/modules/events.js frontend/index.css frontend/index.html
git commit -m "feat: add command palette"
```

---

### Task 9：新增 PWA Manifest

**Objective:** 让应用可添加到手机桌面。

**Files:**

- Create: `frontend/manifest.webmanifest`
- Create: `frontend/assets/icon-192.png`
- Create: `frontend/assets/icon-512.png`
- Modify: `frontend/index.html`

**Manifest Minimum:**

```json
{
  "name": "Bookmarks",
  "short_name": "Bookmarks",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0b0f14",
  "theme_color": "#0b0f14",
  "icons": [
    { "src": "/assets/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/assets/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Verification:**

```bash
npm run build:frontend
```

浏览器 DevTools > Application > Manifest 应无明显错误。

**Commit:**

```bash
git add frontend/manifest.webmanifest frontend/assets frontend/index.html
git commit -m "feat: add pwa manifest"
```

---

### Task 10：新增 Service Worker 离线应用壳

**Objective:** 弱网/离线时仍能打开应用壳和最近缓存的静态资源。

**Files:**

- Create: `frontend/service-worker.js`
- Create: `frontend/modules/pwa.js`
- Modify: `frontend/main.js`
- Modify: `frontend/index.html`

**Cache Strategy:**

- HTML：network first，失败回缓存。
- JS/CSS/assets：cache first，版本更新时刷新。
- `/api/bootstrap-v2`：network first，失败回最近缓存。
- 写接口不缓存。

**Important:**

不要缓存敏感配置接口返回值，尤其是未来服务状态里可能含内部地址。

**Verification:**

```bash
npm run build:frontend
```

手测：

1. 正常打开页面。
2. DevTools 切 Offline。
3. 刷新页面，应用壳仍可打开。

**Commit:**

```bash
git add frontend/service-worker.js frontend/modules/pwa.js frontend/main.js frontend/index.html
git commit -m "feat: add offline app shell"
```

---

### Task 11：设计服务状态数据模型

**Objective:** 为个人运维入口页添加轻量服务状态能力。

**Files:**

- Modify: `backend/db.js`
- Create: `shared/services/service-status.js`
- Create: `backend/routes/service-status.js`
- Modify: `backend/routes/index.js`
- Modify: `backend/server.js`
- Create: `tests/service-status.test.js`

**SQLite Tables:**

```sql
CREATE TABLE IF NOT EXISTS monitored_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT DEFAULT 'services',
  enabled INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_status_results (
  service_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  http_status INTEGER,
  latency_ms INTEGER,
  error TEXT,
  checked_at TEXT NOT NULL,
  FOREIGN KEY(service_id) REFERENCES monitored_services(id) ON DELETE CASCADE
);
```

**API:**

```text
GET    /api/service-status
POST   /api/service-status/check
POST   /api/service-status/services
PUT    /api/service-status/services/:id
DELETE /api/service-status/services/:id
```

**Verification:**

```bash
npm test -- tests/service-status.test.js
npm run lint
```

**Commit:**

```bash
git add backend shared tests
git commit -m "feat: add service status data model and api"
```

---

### Task 12：实现服务健康检查器

**Objective:** 后端可以主动检查配置的服务 URL，并记录状态。

**Files:**

- Create: `backend/services/service-checker.js`
- Modify: `shared/services/service-status.js`
- Modify: `backend/routes/service-status.js`
- Modify: `tests/service-status.test.js`

**Rules:**

- 默认只允许 `http` / `https`。
- 复用 `backend/utils/safe-fetch.js`，避免 SSRF 风险。
- 超时默认 5 秒。
- 只保存：状态、HTTP code、延迟、错误摘要、检查时间。
- 不保存响应 body。

**Verification:**

```bash
npm test -- tests/service-status.test.js
npm run lint
```

**Commit:**

```bash
git add backend/services/service-checker.js shared/services/service-status.js backend/routes/service-status.js tests/service-status.test.js
git commit -m "feat: check monitored service health"
```

---

### Task 13：前端服务状态卡片

**Objective:** 在首页增加可选“服务状态”区域。

**Files:**

- Create: `frontend/modules/service-status.js`
- Modify: `frontend/modules/api-core.js` or Create: `frontend/modules/api-service-status.js`
- Modify: `frontend/modules/render.js`
- Modify: `frontend/index.css`
- Modify: `frontend/index.html` if needed

**UI Requirements:**

每个服务卡片展示：

```text
服务名
状态：正常 / 异常 / 未检查
HTTP 状态码
延迟 ms
最后检查时间
```

颜色建议：

- 正常：绿色
- 异常：红色
- 未检查：灰色
- 检查中：蓝色/呼吸动画

**Verification:**

```bash
npm run lint
npm run build:frontend
```

手测：

- 无服务时显示空状态。
- 有服务时展示卡片。
- 点击刷新可触发检查。

**Commit:**

```bash
git add frontend/modules/service-status.js frontend/modules/api-service-status.js frontend/modules/render.js frontend/index.css frontend/index.html
git commit -m "feat: show monitored service cards"
```

---

### Task 14：服务状态配置 UI

**Objective:** 允许在前端添加、编辑、删除监控服务。

**Files:**

- Modify: `frontend/modules/settings.js`
- Modify: `frontend/modules/service-status.js`
- Modify: `frontend/index.css`
- Modify: `frontend/modules/api-service-status.js`

**Fields:**

```text
name：显示名
url：健康检查 URL
category：分类，可选
enabled：是否启用
sort_order：排序
```

**Validation:**

- URL 必须是 http/https。
- name 不能为空。
- 删除前二次确认。

**Verification:**

```bash
npm run lint
npm run build:frontend
```

手测 CRUD。

**Commit:**

```bash
git add frontend
 git commit -m "feat: manage monitored services in settings"
```

---

### Task 15：CI 修正与质量门禁

**Objective:** 确保 GitHub Actions 能验证测试、lint、build、audit。

**Files:**

- Modify: `.github/workflows/ci.yml`

**Required Jobs:**

```bash
npm ci
npm test
npm run lint
npm run build:frontend
npm run audit:high
```

**Verification:**

本地先跑：

```bash
npm ci
npm test
npm run lint
npm run build:frontend
npm run audit:high
```

**Commit:**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enforce test lint build audit"
```

---

### Task 16：文档更新

**Objective:** README 反映新定位、新配置、新 PWA 和服务状态功能。

**Files:**

- Modify: `README.md`
- Modify: `.env.example`
- Potentially Modify: `docker-compose.yml`

**Update Sections:**

- 项目定位：书签导航 + 个人入口页。
- PWA 使用方法。
- 服务状态配置说明。
- Docker 部署说明。
- AI provider 文档与实际代码保持一致。
- 测试/开发命令。

**Verification:**

```bash
npm run lint
npm run build:frontend
```

**Commit:**

```bash
git add README.md .env.example docker-compose.yml
git commit -m "docs: document personal portal features"
```

---

## 4. 最终验收清单

全部完成后运行：

```bash
git status --short --branch
npm ci
npm test
npm run lint
npm run build:frontend
npm run audit:high
```

浏览器手测：

- 首页加载正常。
- 搜索书签正常。
- 新增/编辑/删除书签正常。
- 分类切换正常。
- 设置面板正常。
- 图标获取正常。
- `/api/proxy-icon` 正常。
- `/api/icon/proxy` 兼容正常。
- 500+ 书签时虚拟滚动 DOM 数量合理。
- Cmd+K 命令面板正常。
- 手机窄屏布局正常。
- PWA manifest 无错误。
- 离线刷新能打开应用壳。
- 服务状态卡片正常显示。
- 服务状态 CRUD 正常。

生产部署前检查：

```bash
docker compose config
docker compose build
docker compose up -d
curl -fsS http://127.0.0.1:3000/api/health
```

---

## 5. 风险与回滚

### 风险 1：前端拆包导致循环依赖暴露

应对：

- 每拆一个模块就跑 `npm run build:frontend`。
- 不要一次性重写所有 import。
- 保留兼容 re-export，逐步迁移。

### 风险 2：Service Worker 缓存旧资源

应对：

- SW cache name 带版本号。
- 新版本 activate 时删除旧 cache。
- README 写清强刷/注销 SW 方法。

### 风险 3：服务状态接口引入 SSRF 风险

应对：

- 复用 `safe-fetch`。
- 限制协议为 http/https。
- 超时 5 秒。
- 不保存响应 body。
- 不允许前端读取本机敏感地址返回内容。

### 风险 4：虚拟滚动破坏布局

应对：

- 大于阈值才启用，例如 `bookmarks.length > 100`。
- 小列表继续普通渲染。
- 保留开关，方便回滚。

---

## 6. 推荐执行顺序

最推荐先做：

1. Task 2：恢复测试脚手架。
2. Task 3：Bootstrap 缓存测试。
3. Task 4：图标代理兼容测试与修复。
4. Task 5-6：真实拆包与懒加载。
5. Task 7：虚拟滚动修正。
6. Task 9-10：PWA。
7. Task 11-14：服务状态面板。
8. Task 15-16：CI 与文档。

如果只做一个短平快版本，建议范围收缩为：

```text
Task 2 + Task 3 + Task 4 + Task 9 + Task 10
```

这样可以最快得到：

- 测试恢复
- 图标代理不回归
- 手机可安装
- 离线可打开

---

## 7. 不建议本轮做的事

- 不建议引入 React/Vue 重写。
- 不建议做多用户权限系统。
- 不建议做完整 Prometheus/Grafana 替代品。
- 不建议复杂插件系统。
- 不建议继续扩大 AI provider 范围，除非先统一文档和配置。
- 不建议为了虚拟滚动引入大型 UI 库。

---

## 8. 完成后的定位

完成后，项目定位可以从：

```text
书签导航 - 支持 Docker 部署
```

升级为：

```text
个人入口页：书签导航、快捷搜索、PWA、TODO、服务健康状态与轻量运维面板。
```

这更符合你的实际使用场景：既能做浏览器首页，也能做手机桌面入口，还能快速看到自部署服务是否正常。
