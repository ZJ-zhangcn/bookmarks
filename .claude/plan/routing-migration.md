# 后端路由统一迁移计划

## 概述
将 `backend/server.js` 中的 ~54 个路由定义迁移到 `backend/routes/` 模块化结构，统一安全基线。

## 迁移策略 (Codex 推荐: Option A - 增量挂载)

### 安全基线要求
每个迁移的路由必须包含:
1. `requireAdmin` 认证中间件 (敏感操作)
2. `assertSafeFetchUrl` SSRF 防护 (外部 URL 请求)
3. 统一错误处理包装

### 模块优先级表

| 优先级 | 模块 | 风险等级 | 安全补丁 |
|--------|------|----------|----------|
| 1 | system.js | 低 | 无需修改 |
| 2 | config.js | 低 | 无需修改 |
| 3 | categories.js | 低 | 添加 requireAdmin |
| 4 | bookmarks.js | 中 | 添加 requireAdmin |
| 5 | engines.js | 低 | 无需修改 |
| 6 | data.js | 中 | 添加 requireAdmin |
| 7 | icons.js | 中 | 添加 assertSafeFetchUrl |
| 8 | icon.js | 中 | 添加 assertSafeFetchUrl |
| 9 | favicon.js | 高 | 添加 assertSafeFetchUrl + requireAdmin |
| 10 | docker.js | 高 | 添加 requireAdmin |
| 11 | webdav.js | 高 | 完整安全审计 |

### 迁移步骤 (每个模块)

#### Step 1: 安全补丁
```javascript
// routes/xxx.js
const { requireAdmin, assertSafeFetchUrl } = require('../middleware/security');

router.post('/sensitive-action', requireAdmin, async (req, res) => {
  // ...
});

router.get('/fetch-external', async (req, res) => {
  assertSafeFetchUrl(req.query.url);
  // ...
});
```

#### Step 2: 路由挂载
```javascript
// server.js 增量挂载
const xxxRoutes = require('./routes/xxx');
app.use('/api/xxx', xxxRoutes);

// 注释掉对应的内联路由
// app.get('/api/xxx', ...) // MIGRATED to routes/xxx.js
```

#### Step 3: 验证清单
- [ ] 功能测试通过
- [ ] 安全中间件生效
- [ ] 错误响应格式一致
- [ ] 无遗漏路径

### 兼容路径映射

| Legacy Path | New Path | 状态 |
|-------------|----------|------|
| `/api/bookmarks` | `/api/bookmarks` | 保持 |
| `/api/categories` | `/api/categories` | 保持 |
| `/api/config` | `/api/config` | 保持 |

### 全局错误处理

```javascript
// middleware/errorHandler.js
module.exports = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${err.stack}`);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    code: err.code || 'UNKNOWN_ERROR'
  });
};

// server.js (在所有路由之后)
app.use(require('./middleware/errorHandler'));
```

### Cutover 验证

迁移完成后执行:
```bash
# 1. 路由数量检查
grep -c "app\.\(get\|post\|put\|delete\)" backend/server.js
# 目标: < 10 (仅保留核心启动路由)

# 2. 功能测试
npm test

# 3. 安全扫描
npm run audit
```

## 执行顺序
1. 创建 `middleware/security.js` 提取安全函数
2. 按优先级表逐个迁移模块
3. 每个模块迁移后立即测试
4. 全部完成后执行 Cutover 验证
