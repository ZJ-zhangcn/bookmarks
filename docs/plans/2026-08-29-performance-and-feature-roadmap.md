# 书签导航后续性能与功能优化实施方案

> 适用场景：个人使用，远端 VPS + Docker + Nginx 反向代理。本文暂不把公网攻击防护作为实施重点，优先保证功能、性能、数据可靠性和发布可回滚。

## 1. 当前基线

当前版本：`623d054`。

已具备：

- SQLite WAL、schema 迁移、迁移前备份；
- 每日 SQLite 在线备份和完整性校验；
- JSON 合并导入、完整恢复、浏览器书签导入、WebDAV 手动同步；
- Bootstrap 聚合接口和内存缓存；
- 前端统一 API 请求层；
- 图标懒加载、图标发现缓存和代理；
- PWA 更新提示和版本化缓存；
- 大列表虚拟滚动；
- 单元、接口和 Playwright 端到端测试；
- CI 成功后才发布 Docker 镜像；
- 健康接口包含版本、commit、构建时间、schema 和最近备份。

当前生产数据约为 8 个分类、162 个书签、5 个搜索引擎。5000 条书签性能基线约为：

| 指标 | 当前结果 |
| --- | ---: |
| Bootstrap 响应体 | 约 1.23 MB |
| JSON 解析 | 约 1.5 ms |
| 首屏完成 | 约 466 ms |
| 搜索命中 | 约 332 ms |
| 页面书签卡片 DOM | 约 60 个 |

结论：当前数据量没有数据库或分页瓶颈，下一阶段应先修复局部无效工作和边界缺陷，再增加高频实用功能。

## 2. 总体目标与非目标

### 2.1 目标

1. 修复图标批量懒加载可能遗漏的问题。
2. 避免访问统计、单条增删改触发全量查询和全页面刷新。
3. 缩小镜像和静态资源传输成本，加快容器健康确认。
4. 增加回收站、撤销删除、批量整理、数据健康检查等个人使用高收益功能。
5. 将每日备份扩展为可选的异地备份。
6. 保持 SQLite 单机架构简单，所有数据库变化继续使用自动迁移和迁移前备份。

### 2.2 暂不实施

- 不切换 PostgreSQL/MySQL；
- 不拆分微服务或引入 Redis、消息队列；
- 不在当前 162 条数据下实施分页；
- 不提前实现复杂的服务端全文搜索；
- 不改成多用户系统；
- 不在本方案内扩大公网安全改造范围。

## 3. 实施顺序总览

| 发布批次 | 内容 | 数据库迁移 | 风险 | 建议优先级 |
| --- | --- | --- | --- | --- |
| R1 | 图标队列、精确缓存失效、CRUD 局部更新 | 无 | 低 | 立即做 |
| R2 | 静态缓存、图标压缩、Docker 镜像瘦身 | 无 | 低至中 | 紧随 R1 |
| R3 | 书签回收站和撤销删除 | schema v2，新增表 | 中 | 功能第一优先 |
| R4 | 批量整理和标签管理 | 通常无；必要时 v3 | 中 | 功能第二优先 |
| R5 | 数据健康中心 | 可先无迁移；持久化检查结果时 v3 | 中 | 功能第三优先 |
| R6 | WebDAV 自动异地备份、快速收藏 | 无或只增配置 | 中 | 按实际需求 |
| R7 | 搜索索引、增量同步、虚拟滚动算法升级 | 视实现而定 | 中至高 | 达到阈值再做 |

每个发布批次单独提交、单独构建镜像、单独部署，不把所有改动合并为一次大版本。

---

## 4. R1：前端数据链路和缓存精确化

### 4.1 图标懒加载队列

#### 问题

`frontend/modules/api.js` 当前每次最多请求 20 个 ID，并使用一个全局 `isLoadingIcons` 标志。元素进入可视区后会被取消观察；如果同一批可见元素超过 20 个，或上一批请求尚未结束，部分 ID 可能没有再次进入加载流程。

#### 设计

增加一个页面内图标任务队列：

```text
IntersectionObserver 发现可见卡片
→ ID 放入 pending Set 去重
→ 调度器按每批 20～50 个取出
→ 最多 1～2 个并发请求
→ 成功写入 iconCache
→ 无图标写入负缓存
→ 临时失败最多重试 2 次
```

要求：

- 已缓存、已排队、正在请求的 ID 不重复加入；
- 元素只有在已缓存或已成功进入队列后才停止观察；
- 请求失败后允许有限重试，不能无限循环；
- 虚拟滚动销毁并重建 DOM 后仍能正确加载图标；
- 切换分类、搜索、滚动时不重复请求相同 ID。

主要文件：

- `frontend/modules/api.js`
- `frontend/modules/state.js`（如需集中保存队列状态）
- `tests/icon-*`
- 新增针对队列的单元测试和 Playwright 用例

#### 验收

- 模拟一次出现 100 个待加载图标，最终 100 个都进入成功或负缓存状态；
- 同一 ID 在一次页面会话中只请求一次；
- 并发请求不超过约定值；
- 快速滚动没有未处理异常或持续请求风暴。

### 4.2 Bootstrap 精确缓存失效

#### 问题

目前所有 `/api/bookmarks` 的 POST/PUT/DELETE 成功后都会清空 Bootstrap 缓存。点击书签记录访问次数使用 `POST /api/bookmarks/:id/visit`，也会导致整个聚合缓存失效。

#### 设计

将写操作分为两类：

| 操作 | 缓存处理 |
| --- | --- |
| 新增、编辑、删除、排序、导入恢复、AI 标签更新 | 清空或重建缓存 |
| 单次访问统计 | 直接修补缓存中的 `visit_count` 和 `last_visited_at` |

在 `backend/bootstrap-v2.js` 增加明确的缓存 API，例如：

```js
clearBootstrapCache()
updateCachedBookmarkVisit(id, visitedAt)
upsertCachedBookmark(bookmark) // 可在后续局部写入中使用
removeCachedBookmark(id)
```

不要继续仅靠路径前缀判断所有写操作。缓存更新应在数据库写入成功后执行。

主要文件：

- `backend/server.js`
- `backend/bootstrap-v2.js`
- `backend/routes/bookmarks.js`
- `shared/services/bookmarks.js`
- `tests/bookmark-visits.test.js`
- 新增缓存精确失效测试

#### 验收

- 访问统计成功后，下一次 Bootstrap 请求仍为 `HIT`；
- 返回的访问次数已更新，而不是等待 5 分钟；
- 新增、编辑、删除书签后不会返回旧数据；
- 导入、完整恢复和 AI 标签更新仍会正确更新缓存。

### 4.3 单条 CRUD 局部更新

#### 问题

保存或删除一条书签后，前端会重新请求完整 Bootstrap 并执行 `renderAll()`。数据量较大时会产生不必要的网络、JSON、筛选和 DOM 工作。

#### 设计

后端保存接口返回完整的书签对象，而不只是 ID。前端增加状态操作：

```js
upsertBookmark(bookmark)
removeBookmark(id)
replaceBookmarksForCategory(categoryId, items) // 排序时可用
```

写入成功后的处理：

- 新增/编辑：更新 `state.bookmarks` 中的一条记录；
- 删除：直接从状态移除；
- 只重绘受影响分类、分类数量、常用/最近访问区域；
- 只有状态无法校准时才回退到 `loadData()`；
- 排序和完整恢复仍可保留一次全量刷新，先不强行局部化。

第一版即使仍调用 `renderBookmarks()`，只要不重新请求 Bootstrap、不调用全部模块的 `renderAll()`，也能获得主要收益。第二版再考虑真正的单个分类 DOM 更新。

主要文件：

- `shared/services/bookmarks.js`
- `backend/routes/bookmarks.js`
- `frontend/modules/state.js`
- `frontend/modules/bookmark.js`
- `frontend/modules/render.js`
- `frontend/modules/insights.js`

#### 验收

- 新增、编辑、删除一条书签后不再发起 `/api/bootstrap-v2` 请求；
- 页面状态和数据库一致；
- 编辑分类、标签、图标后立即正确显示；
- 网络失败时不提前修改本地状态；
- 5000 条书签下单条保存和删除的 UI 完成时间明显低于当前全量刷新路径。

### 4.4 R1 测试与退出条件

执行：

```bash
npm test
npm run lint
npm run build:frontend
PLAYWRIGHT_USE_SYSTEM_CHROME=true npm run test:e2e
```

R1 只有在以下条件全部满足后才能部署：

- 全部现有测试通过；
- 新增图标队列和缓存测试；
- Playwright 验证 CRUD 后没有全量 Bootstrap 请求；
- 5000 条性能基线没有回退超过 20%。

---

## 5. R2：静态资源和 Docker 运行成本

### 5.1 内容 Hash 资源长期缓存

Vite 生成的 JS/CSS 已带内容 Hash，可安全使用：

```http
Cache-Control: public, max-age=31536000, immutable
```

规则：

- `/assets/*-<hash>.js`、`/assets/*-<hash>.css`：一年并 immutable；
- `index.html`：`no-cache`；
- `service-worker.js`：`no-store`；
- manifest：短缓存或 `no-cache`；
- 不带 Hash 的固定资源按实际更新机制设置缓存。

主要文件：`backend/server.js`。

验收：使用 HTTP 测试锁定不同资源的 `Cache-Control`。

### 5.2 PWA 图标压缩

当前构建产物中 512 图标约 253 KB，192 图标约 39 KB。保持透明度和视觉效果的前提下重新压缩，建议目标：

- 192 图标小于 25 KB；
- 512 图标小于 100 KB。

更新后必须重新生成 Service Worker cache hash，并检查 manifest 安装图标。

### 5.3 Docker 镜像瘦身

运行时阶段不应长期保留 `python3`、`make`、`g++`。建议使用依赖构建阶段：

```text
frontend-builder：构建 dist
production-deps-builder：安装生产依赖并编译 better-sqlite3
runtime：只复制 node_modules、backend、shared、dist
```

Runtime 只保留 Node、CA 证书和 native 模块真正需要的运行库。不要直接跨不兼容 libc/架构复制 native 二进制；所有阶段保持相同 Node major 和 Alpine 基础。

同时将 Docker 健康检查调整为：

- `start-period` 约 10～20 秒；
- `interval` 约 10 秒；
- `timeout` 3～5 秒；
- `retries` 3～5 次。

验收：

- `better-sqlite3` 可正常打开现有数据库；
- 迁移、备份、完整恢复测试正常；
- 镜像体积较优化前下降至少 20%；
- 容器启动后更快进入 healthy；
- amd64 VPS 上构建发布的 GHCR 镜像正常运行。

---

## 6. R3：回收站与撤销删除

这是功能优化的第一优先级。

### 6.1 数据库设计

建议 schema v2 新增独立回收站表，而不是直接给 `bookmarks` 添加 `deleted_at`：

```sql
CREATE TABLE bookmark_trash (
    id TEXT PRIMARY KEY,
    snapshot_json TEXT NOT NULL,
    deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);

CREATE INDEX idx_bookmark_trash_deleted_at
ON bookmark_trash(deleted_at DESC);
```

选择独立表的原因：

- 旧版本应用不会把软删除书签重新显示出来；
- 正常查询无需到处追加 `deleted_at IS NULL`；
- 回滚到旧镜像时，活动书签数据仍保持兼容；
- snapshot 可完整保存书签字段、分类信息、AI 标签和摘要。

删除事务：

```text
读取书签 + 分类元信息 + bookmark_ai
→ 写入 bookmark_trash.snapshot_json
→ 删除 bookmark_ai
→ 删除 bookmarks
→ 提交
```

恢复事务：

```text
校验 snapshot
→ 原分类存在则恢复原分类
→ 原分类不存在则创建“已恢复”分类或让用户选择分类
→ 恢复 bookmarks 和 bookmark_ai
→ 删除 trash 记录
→ 提交
```

第一版只处理书签回收站，不同时改造分类删除，避免范围过大。

### 6.2 API

建议增加：

```text
GET    /api/bookmarks/trash
POST   /api/bookmarks/:id/restore
DELETE /api/bookmarks/trash/:id        永久删除单条
DELETE /api/bookmarks/trash?expired=1  清理过期项
```

现有删除接口改为移动到回收站，并返回 trash ID、书签名称和过期时间。

### 6.3 前端

- 删除成功 Toast 显示“撤销”；
- 设置中增加“回收站”；
- 支持单条恢复、永久删除、清空回收站；
- 默认保留 30 天，可配置 7～365 天；
- 完整导出包含 `bookmark_trash`；
- 完整恢复能恢复回收站数据；合并导入默认不导入垃圾记录。

### 6.4 验收

- 删除后首页立即消失，点击撤销后恢复原位置和标签；
- 分类不存在时有确定、可解释的恢复行为；
- 批量或单条永久删除需要二次确认；
- 迁移前自动备份创建成功；
- v1 数据升级到 v2 后活动书签数量不变；
- 旧镜像回滚时不会显示回收站项目。

---

## 7. R4：批量整理与标签管理

### 7.1 批量选择模式

在书签区域增加“批量整理”：

- 当前分类全选/取消；
- 搜索结果全选；
- 批量移动分类；
- 批量添加标签；
- 批量删除标签；
- 批量刷新图标；
- 批量移入回收站。

批量 API 应在 SQLite 事务中执行，并限制单次最多约 500 条，返回成功数、跳过数和错误样本。

建议接口：

```text
POST /api/bookmarks/batch
{
  "ids": ["..."],
  "action": "move|add-tags|remove-tags|trash|refresh-icons",
  "payload": {}
}
```

### 7.2 重复书签整理

浏览器导入已经支持按 URL 识别重复项，可复用规范化规则检查现有数据库：

- scheme 和 hostname 大小写规范化；
- 移除默认端口；
- 可选移除尾部 `/`；
- 默认不删除 query 参数；
- 不自动合并，只提供预览和人工确认。

合并时明确选择保留项，并合并访问次数、最近访问时间、标签、描述和最佳图标。

### 7.3 标签体验

- 点击标签直接筛选；
- 输入标签时推荐已有标签；
- 标签页显示使用次数；
- 支持标签重命名、合并和删除；
- 支持“无标签”筛选；
- 标签批量变更必须同步清除或更新 Bootstrap 缓存。

### 7.4 验收

- 500 条批量移动在单个事务内成功或整体回滚；
- 批量删除全部进入回收站；
- 重复项不会未经确认自动删除；
- 标签合并后搜索、编辑弹窗、导出恢复结果一致；
- 操作期间按钮禁用并显示进度或明确的处理中状态。

---

## 8. R5：数据健康中心

### 8.1 第一阶段：纯本地检查

先实现快速、无外部网络的检查：

- 重复 URL；
- 空 URL 或 URL 格式异常；
- 引用不存在分类的书签；
- 缺失图标；
- 无标签书签；
- 长期未访问书签；
- SQLite `integrity_check`；
- 最近备份时间、大小、schema 版本；
- WebDAV 最近手动同步状态。

这些检查可即时执行，不必新增数据库表。

### 8.2 第二阶段：失效链接检查

外部链接检查必须是显式启动或低频后台任务：

- 并发 3；
- 单站超时约 5 秒；
- 优先 HEAD，必要时回退小流量 GET；
- 2xx/3xx 正常；401/403 标记为“需人工确认”，不直接判失效；
- 连续两次失败后才标记为可能失效；
- 支持暂停、继续和重新检查；
- 结果按 URL 持久化时再增加 schema v3 表。

不要复用或恢复过去被移除的通用服务监控功能；这里仅检查书签数据质量。

### 8.3 验收

- 本地检查在 5000 条数据下数秒内完成；
- 检查不会修改数据；
- 修复操作必须逐类预览和确认；
- 链接检查不会阻塞主进程的普通 API；
- 容器重启后，若已增加持久化表，检查结果仍可读取。

---

## 9. R6：异地备份与快速收藏

### 9.1 WebDAV 自动异地备份

当前每日备份与数据库位于同一个 Docker volume，只能覆盖误删和程序错误，不能覆盖 VPS 磁盘损坏。

增加可选服务端环境变量：

```text
DB_OFFSITE_BACKUP_ENABLED=true
DB_OFFSITE_BACKUP_PROVIDER=webdav
DB_OFFSITE_WEBDAV_URL=...
DB_OFFSITE_WEBDAV_USERNAME=...
DB_OFFSITE_WEBDAV_PASSWORD=...
DB_OFFSITE_WEBDAV_PATH=bookmarks/sqlite-backups/
DB_OFFSITE_BACKUP_LIMIT=30
```

流程：

```text
SQLite 在线备份
→ integrity_check
→ 上传 WebDAV 临时文件名
→ 服务端完成后重命名（服务支持时）
→ 记录最近成功时间和文件摘要
→ 清理超过保留数量的远端备份
```

设置页面只展示启用状态、最近成功/失败、文件名和大小，不把服务端密码返回浏览器。

验收必须包含一次真实的“下载备份到临时目录并只读打开”的恢复演练。

### 9.2 快速收藏

按开发成本分两步：

1. Bookmarklet 打开导航站的新增页面：

```text
https://导航域名/?action=add&url=<当前地址>&title=<当前标题>
```

页面读取参数后打开新增弹窗，再由用户确认分类、标签和图标。

2. PWA Web Share Target：移动端从浏览器“分享”到书签导航，填入 URL 和标题。

第一版不做跨域直接写 API，也不自动保存，避免收藏错误页面或重复项。

---

## 10. R7：达到规模阈值后再实施

以下优化只在指标触发时实施：

| 触发条件 | 优化 |
| --- | --- |
| 书签超过 1000 且搜索持续超过 300～500 ms | 构建前端标准化搜索文本索引，输入时不重复拼接和 lowercase |
| 书签超过 5000 或 Bootstrap 超过 2～4 MB | 增量同步、按分类懒加载或字段裁剪 |
| 冷启动受网络影响明显 | IndexedDB 保存上次 Bootstrap，先展示旧数据再后台同步 |
| 虚拟列表滚动出现卡顿 | 行高前缀和 + 二分查找，替代当前逐行扫描和 offset 累加 |
| 单条变更频繁且全量同步成本明显 | 数据版本号、`changed_since` 增量接口 |

### 10.1 搜索索引

为每条书签预计算：

```js
searchText = normalize(name + description + url + tags + categoryName)
```

只在数据新增或变更时更新，而不是每次键盘输入重新组合。需要拼音或模糊搜索时，先测量 bundle 增量和搜索耗时，再决定是否引入依赖。

### 10.2 虚拟滚动算法

当前可见范围和起始偏移需要逐行累加。数据非常大时改为：

- 维护每行高度数组；
- 维护前缀高度；
- 用二分查找由 `scrollTop` 定位起始行；
- 只更新受测量影响的区间。

在当前 162 条数据下没有必要提前改造。

---

## 11. 数据迁移和回滚原则

1. 所有 schema 变化必须新增版本迁移，禁止启动时临时 `ALTER TABLE`。
2. 迁移前自动 SQLite 在线备份并执行 `integrity_check`。
3. 优先采用新增表、新增可空字段等向后兼容变化。
4. 每个迁移都要测试：新库初始化、旧库升级、重复启动幂等、迁移失败回滚。
5. 部署前保留旧 Docker 镜像标签和 Compose 配置。
6. 不删除 Docker volume，不在普通部署中覆盖数据库文件。
7. 新版本健康检查失败时先回滚应用镜像；只有确认数据库被破坏时才考虑恢复快照。
8. 回收站采用独立表，以保证回滚旧镜像时不会重新显示已删除书签。

## 12. 测试策略

### 12.1 单元与接口测试

每项至少覆盖：

- 正常路径；
- 空数据；
- 重复请求；
- 部分失败；
- 事务回滚；
- 缓存一致性；
- 导出与完整恢复兼容；
- schema 迁移幂等。

### 12.2 Playwright 用户流程

逐步增加：

- 100 个可见图标最终全部处理；
- 新增、编辑、删除不重新请求 Bootstrap；
- 删除后撤销；
- 回收站恢复和永久删除；
- 批量移动、标签变更、批量回收；
- 重复书签预览和人工合并；
- 数据健康检查只读扫描；
- PWA 新版本更新仍正常。

### 12.3 性能回归门槛

保留 5000 条基线，并设置 CI 宽松上限以降低机器波动：

- 响应体小于 4 MB；
- JSON 解析小于 250 ms；
- 首屏小于 5 秒；
- 搜索小于 2 秒；
- DOM 书签卡片少于 500。

同时在本地记录更严格的观察目标：首屏约 1 秒内、搜索约 500 ms 内、卡片少于 100。CI 门槛用于防止严重回退，本地目标用于指导优化。

## 13. 每次生产发布流程

每个 R 批次都按以下流程：

```text
本地测试、Lint、构建、E2E
→ 提交并推送 main
→ 等待 GitHub Actions validate 成功
→ 等待 GHCR latest 构建成功
→ VPS 标记当前镜像为 pre-<commit>
→ SQLite 在线备份并 integrity_check
→ 备份 Compose 配置
→ docker compose pull
→ docker compose up -d --force-recreate
→ 等待 healthy
→ 检查 /api/health 的 commit 和 schema
→ 检查 SQLite integrity 和业务数据数量
→ 检查日志与 Nginx 入口
```

带数据库迁移的 R3/R5 额外检查迁移前备份和 schema 版本。

## 14. 推荐的实际执行次序

后续开始实施时，建议严格按以下顺序：

1. 图标懒加载队列；
2. 访问统计精确更新 Bootstrap 缓存；
3. 单条书签 CRUD 局部状态更新；
4. 静态缓存和 PWA 图标压缩；
5. Docker 镜像瘦身和健康检查提速；
6. 回收站与撤销删除；
7. 批量移动、批量标签、批量回收；
8. 重复书签整理和标签聚合；
9. 数据健康中心；
10. WebDAV 自动异地备份；
11. Bookmarklet/PWA 快速收藏；
12. 达到数据阈值后再做搜索索引、增量同步和虚拟滚动算法升级。

这样安排能先解决已有实现中的实际边界问题，再增加日常最有价值的功能，同时让每次生产变更都保持小范围、可测试、可回滚。
