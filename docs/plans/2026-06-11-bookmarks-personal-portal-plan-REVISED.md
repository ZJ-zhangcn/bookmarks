# Bookmarks 个人入口页改造实施计划（修正版）

**修订日期：** 2026-06-11
**修订原因：** 基于实际项目状态重新规划，移除伪需求，优先交付核心价值

---

## 0. 当前基线（实际验证）

**仓库状态：**
```text
路径：C:\Users\19166\Desktop\projects\bookmarks
当前分支：main
HEAD：d69826b fix: 移除兜底图标服务的验证跳过逻辑
```

**质量现状：**
```bash
✅ npm test: 48/50 通过 (2 个 icon-discovery 测试失败)
✅ npm run lint: 通过
✅ npm run build:frontend: 通过，有 4 个动态 import 警告
✅ npm run audit:high: 0 vulnerabilities
✅ tests/ 目录存在，包含 20 个测试文件
```

**构建产物：**
```text
main-DjPmxbvE.js: 114.69 kB raw / 31.73 kB gzip
index-DyxNZlz6.css: 101.15 kB raw / 15.78 kB gzip
```

**需验证项：**
- [ ] 虚拟滚动在 500+ 书签时的 DOM 数量
- [ ] 图标代理路径是否真的有问题
- [ ] 前端代码分割的实际收益

---

## 1. 改造原则

- **先交付价值，后优化内部：** PWA 优先于代码重构
- **验证假设再动手：** 先测试再修复，不解决不存在的问题
- **最小改动原则：** 能用配置解决的不改代码
- **独立迭代：** PWA、服务状态、性能优化各自独立，避免大爆炸
- **每步可验证：** 每个任务都有明确的验收标准

---

## 2. 版本里程碑

### Phase 1：PWA 入口版（1 周，核心价值）
- ✅ PWA Manifest + 应用图标
- ✅ Service Worker 离线壳
- ✅ 手机可安装到桌面
- ✅ 命令面板 (Cmd+K)

### Phase 2：质量加固版（1 周，可选）
- ✅ 修复失败的测试
- ✅ 补充图标代理兼容性测试
- ✅ 验证虚拟滚动实际效果
- ✅ CI 门禁加固

### Phase 3：服务状态版（2 周，独立功能）
- ✅ 后端健康检查 API
- ✅ 前端服务卡片 UI
- ✅ 定时检查机制
- ✅ SSRF 防护

### Phase 4：性能优化版（按需，数据驱动）
- 📊 基于实测数据决定是否执行
- 🔧 前端代码分割
- 🔧 虚拟滚动优化

---

## 3. 任务清单

### ✅ Task 1：验证基线与假设

**目标：** 确认哪些问题真实存在，避免解决伪需求

**验证项：**

1. **测试覆盖现状：**
```bash
npm test 2>&1 | tee baseline-test.txt
# 预期：48/50 通过，记录失败的 2 个测试
```

2. **虚拟滚动真实效果：**
```bash
# 手动测试：导入 500+ 书签，DevTools 查看
document.querySelectorAll('.bookmark-card').length
# 如果 < 100，说明虚拟滚动有效；如果 = 500+，才需要修复
```

3. **图标代理路径测试：**
```bash
# 启动服务后测试
curl -I "http://localhost:3000/api/proxy-icon?url=https://example.com"
curl -I "http://localhost:3000/api/icon/proxy?url=https://example.com"
curl -X POST "http://localhost:3000/api/favicon" -H "Content-Type: application/json" -d '{"url":"https://example.com"}'
# 预期：返回 JSON/图片，不返回 HTML
```

**产出：**
- `baseline-test.txt` - 测试结果
- `baseline-virtual-scroll.md` - 虚拟滚动验证记录
- `baseline-icon-proxy.md` - 图标代理行为记录

**Commit：**
```bash
git checkout -b feat/pwa-portal
git add docs/baseline-*.md
git commit -m "docs: verify baseline assumptions"
```

---

### ✅ Task 2：PWA Manifest

**目标：** 让应用可添加到手机桌面

**文件：**
- Create: `frontend/manifest.webmanifest`
- Create: `frontend/assets/icon-192.png`
- Create: `frontend/assets/icon-512.png`
- Modify: `frontend/index.html`

**实现：**

`frontend/manifest.webmanifest`:
```json
{
  "name": "书签导航",
  "short_name": "书签",
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

`frontend/index.html` 增加：
```html
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0b0f14">
```

**验收：**
```bash
npm run build:frontend
# DevTools > Application > Manifest 无错误
```

**Commit：**
```bash
git add frontend/manifest.webmanifest frontend/assets frontend/index.html
git commit -m "feat: add pwa manifest"
```

---

### ✅ Task 3：Service Worker 离线壳

**目标：** 弱网/离线时能打开应用

**文件：**
- Create: `frontend/service-worker.js`
- Create: `frontend/modules/pwa.js`
- Modify: `frontend/main.js`

**缓存策略：**
- HTML: network-first，失败回缓存
- JS/CSS: cache-first，版本号变化时更新
- `/api/bootstrap-v2`: network-first
- 写接口: 不缓存

**验收：**
```bash
npm run build:frontend
# 浏览器：正常加载 → DevTools 切 Offline → 刷新 → 应用壳仍可见
```

**Commit：**
```bash
git add frontend/service-worker.js frontend/modules/pwa.js frontend/main.js
git commit -m "feat: add offline app shell"
```

---

### ✅ Task 4：命令面板 (Cmd+K)

**目标：** 快速搜索与操作入口

**文件：**
- Create: `frontend/modules/command-palette.js`
- Modify: `frontend/modules/events.js`
- Modify: `frontend/index.css`

**功能：**
- 搜书签、分类、搜索引擎
- 快速打开设置、新增书签、TODO
- 快捷键：`Cmd/Ctrl+K` 或 `/`

**验收：**
```bash
npm run lint
npm run build:frontend
# 手测：键盘操作正常，移动端不误触发
```

**Commit：**
```bash
git add frontend/modules/command-palette.js frontend/modules/events.js frontend/index.css
git commit -m "feat: add command palette"
```

---

### ✅ Task 5：文档更新

**文件：**
- Modify: `README.md`

**更新内容：**
- 项目定位：书签导航 + 个人入口页 + PWA
- PWA 使用方法（如何添加到桌面）
- 命令面板快捷键说明

**Commit：**
```bash
git add README.md
git commit -m "docs: document pwa features"
```

---

## 4. Phase 2 任务（质量加固，可选）

### Task 6：修复失败的测试

**前提：** Task 1 确认有 2 个测试失败

**目标：** 修复 `icon-discovery.test.js` 中的失败用例

**验收：**
```bash
npm test
# 预期：50/50 通过
```

---

### Task 7：补充图标代理测试

**前提：** Task 1 确认图标代理有问题才执行

**文件：**
- Create or Modify: `tests/icon-proxy.test.js`

**测试用例：**
- `POST /api/favicon` 返回 JSON
- `GET /api/proxy-icon` 不返回 HTML
- `GET /api/icon/proxy` 兼容旧路径

---

### Task 8：CI 门禁

**文件：**
- Modify: `.github/workflows/ci.yml`

**增加检查：**
```yaml
- run: npm test
- run: npm run lint
- run: npm run build:frontend
- run: npm run audit:high
```

---

## 5. Phase 3 任务（服务状态功能，独立迭代）

### Task 9：服务状态数据模型

**文件：**
- Modify: `backend/db.js`
- Create: `backend/routes/service-status.js`
- Create: `shared/services/service-status.js`

**数据库表：**
```sql
CREATE TABLE monitored_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE service_status_results (
  service_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  http_status INTEGER,
  latency_ms INTEGER,
  checked_at TEXT NOT NULL,
  FOREIGN KEY(service_id) REFERENCES monitored_services(id)
);
```

**API：**
```text
GET    /api/service-status
POST   /api/service-status/check
POST   /api/service-status/services
DELETE /api/service-status/services/:id
```

---

### Task 10：健康检查器 + 定时任务

**文件：**
- Create: `backend/services/service-checker.js`

**实现要点：**
- 使用 `backend/utils/safe-fetch.js` 防止 SSRF
- 超时 5 秒
- 并发限制：最多同时检查 5 个服务
- 定时任务：每 60 秒自动检查所有启用的服务

**SSRF 防护：**
- 仅允许 `http://` 和 `https://`
- 禁止访问内网地址（除非 `ALLOW_PRIVATE_NETWORK=true`）

---

### Task 11：前端服务状态卡片

**文件：**
- Create: `frontend/modules/service-status.js`
- Modify: `frontend/modules/render.js`
- Modify: `frontend/index.css`

**UI 显示：**
- 服务名、状态（正常/异常/未检查）
- HTTP 状态码、延迟、最后检查时间
- 颜色：绿色（正常）、红色（异常）、灰色（未检查）

**轮询策略：**
- 前端每 30 秒自动刷新一次
- 手动刷新按钮

---

### Task 12：服务配置 UI

**文件：**
- Modify: `frontend/modules/settings.js`

**功能：**
- 添加/编辑/删除监控服务
- 字段：name, url, enabled

**验证：**
- URL 必须是 http/https
- 删除前二次确认

---

## 6. Phase 4 任务（性能优化，数据驱动）

**决策节点：** 只有满足以下条件才执行

1. Task 1 验证虚拟滚动确实失效（DOM 数量 = 书签总数）
2. 用户反馈首屏加载慢（或通过 Lighthouse 测试 < 80 分）

---

### Task 13：前端代码分割（轻量方案）

**方案 A：** Vite manualChunks（最小改动）

`vite.config.js`:
```js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor': ['better-sqlite3'],
        'settings': ['frontend/modules/settings.js'],
        'ai': ['frontend/modules/ai.js']
      }
    }
  }
}
```

**验收：**
- 首屏 JS < 80 kB gzip
- 设置、AI 按需加载

**如果收益 < 20%：** 放弃方案 B

---

### Task 14：虚拟滚动修复

**前提：** Task 1 确认虚拟滚动失效

**修改：**
- `frontend/modules/virtual-scroll.js`
- 确保滚动容器正确、可视区域计算准确

---

## 7. 风险与回滚

| 风险 | 应对 |
|------|------|
| Service Worker 缓存旧资源 | cache name 带版本号，activate 时删除旧缓存 |
| 服务状态引入 SSRF | 复用 safe-fetch，限制协议和超时 |
| 前端拆包破坏功能 | 每次构建后手测核心功能 |

---

## 8. 最终验收清单

**Phase 1（PWA）完成标准：**
```bash
✅ npm test 通过
✅ npm run lint 通过
✅ npm run build:frontend 通过
✅ 手机浏览器可"添加到主屏幕"
✅ 离线刷新能打开应用壳
✅ Cmd+K 命令面板正常
✅ 文档更新完成
```

**Phase 3（服务状态）完成标准：**
```bash
✅ 可添加/删除监控服务
✅ 服务状态卡片正常显示
✅ 定时检查每 60 秒执行
✅ SSRF 防护测试通过
✅ 前端轮询不影响性能
```

---

## 9. 快速启动路径

如果只想最快交付 PWA（1-2 天）：

```bash
Task 2: PWA Manifest（30 分钟）
Task 3: Service Worker（2 小时）
Task 4: 命令面板（3 小时）
Task 5: 文档更新（30 分钟）
```

**跳过：** Task 1（假设验证）、Phase 2（质量加固）、Phase 3-4（新功能）

---

## 10. 与原计划的主要差异

| 原计划 | 修正后 | 理由 |
|--------|--------|------|
| Task 2-4: 恢复测试 | 删除 | 测试已存在，48/50 通过 |
| Task 5-6: 深度拆包 | 改为可选 | 当前体积合理，按需优化 |
| Task 7: 修复虚拟滚动 | 改为验证后决定 | 未证明当前有问题 |
| PWA 排第 9-10 | 提前到 Task 2-3 | 核心价值优先 |
| 服务状态混在主线 | 独立 Phase 3 | 避免阻塞 PWA 交付 |

---

**修订完成。建议执行顺序：Task 1 → Task 2-5 → 发布 v1.0-PWA → Phase 2-3 渐进迭代**
