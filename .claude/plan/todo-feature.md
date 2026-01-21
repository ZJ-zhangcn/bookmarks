# TODO 待办功能实施计划

## 概述

在书签管理系统中添加 TODO 待办功能，采用独立 `todos` 表 + 前端 `todo-card` 组件方案。

## 架构决策

| 决策点 | 方案 | 理由 |
|--------|------|------|
| 数据模型 | 独立 `todos` 表 | 领域清晰，可扩展（状态、优先级、到期时间等） |
| 布局策略 | 混合排布 | TODO 可与书签混排在同一分类下 |
| 前端组件 | 新增 `todo-card` | 复用卡片样式，独立交互逻辑 |
| 模态框 | 新增 `todoModal` | 与书签表单差异较大，独立模态更清晰 |

## 实施步骤

### Step 1: 数据库层 (backend/db.js)

**MySQL DDL:**
```sql
CREATE TABLE IF NOT EXISTS todos (
    id VARCHAR(50) PRIMARY KEY,
    category_id VARCHAR(50) NULL,
    title VARCHAR(255) NOT NULL,
    notes TEXT,
    is_done TINYINT DEFAULT 0,
    priority INT DEFAULT 0,
    due_at DATETIME NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    INDEX idx_todos_category (category_id),
    INDEX idx_todos_done (is_done),
    INDEX idx_todos_due (due_at),
    INDEX idx_todos_list (category_id, is_done, sort_order, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**SQLite DDL:**
```sql
CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    category_id TEXT,
    title TEXT NOT NULL,
    notes TEXT,
    is_done INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 0,
    due_at DATETIME,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    CHECK (is_done IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_todos_category_id ON todos(category_id);
CREATE INDEX IF NOT EXISTS idx_todos_is_done ON todos(is_done);
CREATE INDEX IF NOT EXISTS idx_todos_due_at ON todos(due_at);
CREATE INDEX IF NOT EXISTS idx_todos_list ON todos(category_id, is_done, sort_order, created_at);
```

### Step 2: 后端 API (backend/routes/todos.js)

**路由设计:**
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | /api/todos | 无 | 获取列表（支持 category_id/status/q 过滤） |
| GET | /api/todos/:id | 无 | 获取单个 |
| POST | /api/todos | requireAdmin | 创建/更新 |
| PUT | /api/todos | requireAdmin | 批量排序/移动 |
| DELETE | /api/todos?id=xxx | requireAdmin | 删除 |

**查询参数:**
- `category_id`: 指定分类；`null` 表示未归类
- `status`: `all`(默认) / `pending` / `done`
- `q`: 模糊搜索（title 或 notes）
- `limit`/`offset`: 分页

**排序规则:**
1. 未完成优先
2. priority 高优先
3. due_at 近的优先（无 due_at 放后面）
4. sort_order → created_at

### Step 3: 数据导入导出 (backend/routes/data.js)

- `exportData()` 增加 `todos` 字段
- `importData()` 支持 `todos` upsert
- 版本号从 `1.0` 升到 `1.1`

### Step 4: 路由注册 (backend/routes/index.js)

```javascript
todos: require('./todos')(db),
```

### Step 5: 前端状态 (frontend/modules/state.js)

```javascript
export let todos = [];
export function setTodos(val) { todos = val; }
```

### Step 6: 前端 API (frontend/modules/api.js)

```javascript
export async function loadTodos() {
    const res = await fetch(`${API_BASE}/api/todos`);
    const result = await res.json();
    if (result.success) setTodos(result.data);
}
```

### Step 7: 前端渲染 (frontend/modules/render.js)

新增 `createTodoCard(item, searchTerm)`:
- 左侧: 复选框（状态切换）
- 中间: 标题 + 备注
- 右上: 编辑/删除按钮
- 完成状态: 中划线 + 透明度

### Step 8: 前端交互 (frontend/modules/todo.js)

新增模块:
- `openTodoModal(todoId)`: 打开模态框
- `saveTodo()`: 保存 TODO
- `toggleTodoStatus(id)`: 切换完成状态
- `deleteTodo(id)`: 删除

### Step 9: 前端 HTML (frontend/index.html)

新增 `todoModal` 模态框:
- 标题输入
- 备注输入（多行）
- 分类选择
- 优先级选择
- 到期时间选择

### Step 10: 前端样式 (frontend/index.css)

```css
.todo-card { border-top: 4px solid var(--primary); }
.todo-card.completed { opacity: 0.7; }
.todo-card.completed .todo-name { text-decoration: line-through; }
.todo-check-wrapper { /* 复选框样式 */ }
```

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| backend/db.js | 修改 | createTables 增加 todos 表 |
| backend/routes/todos.js | 新增 | TODO CRUD API |
| backend/routes/index.js | 修改 | 注册 todos 路由 |
| backend/routes/data.js | 修改 | 导入导出支持 todos |
| frontend/modules/state.js | 修改 | 增加 todos 状态 |
| frontend/modules/api.js | 修改 | 增加 loadTodos |
| frontend/modules/render.js | 修改 | 增加 createTodoCard |
| frontend/modules/todo.js | 新增 | TODO 交互逻辑 |
| frontend/modules/events.js | 修改 | 绑定 TODO 事件 |
| frontend/modules/dom.js | 修改 | 缓存 TODO 模态框元素 |
| frontend/index.html | 修改 | 增加 todoModal |
| frontend/index.css | 修改 | 增加 todo-card 样式 |

## 会话 ID

- Codex: `019bde53-6c9b-70a1-9b88-de3d5010ea1e`
- Gemini: `953dfe11-c900-416a-87cf-d627084f2aa6`

## 状态

- [x] 需求分析
- [x] 方案设计
- [x] 详细规划
- [ ] 数据库层实施
- [ ] 后端 API 实施
- [ ] 前端 UI 实施
- [ ] 集成测试
- [ ] 代码审查
