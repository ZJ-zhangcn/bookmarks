# 虚拟滚动基线验证

日期：2026-06-11T12:18:02Z

## 验证方法

使用当前 `dist/` 构建产物启动临时静态服务，并用临时 API 返回 1 个分类 + 500 条书签。再通过 Headless Chrome 读取真实页面 DOM。

关键检查项：

```js
document.querySelectorAll('.bookmark-card').length
document.querySelector('.bookmarks-grid[data-category="bulk"]')?.dataset?.renderMode
document.querySelector('.virtual-scroll-wrapper')?.clientHeight
```

## Phase 4 修复后实测结果

```json
{
  "ok": true,
  "initial": {
    "ready": "complete",
    "title": "书签导航 | 我的常用网站",
    "renderedCards": 6,
    "renderMode": "virtual",
    "hasVirtualWrapper": true,
    "wrapperClientHeight": 585,
    "wrapperScrollHeight": 70304,
    "wrapperStyleHeight": "min(72vh, 720px)",
    "contentStyleHeight": "70304px",
    "countText": "500 个"
  },
  "afterScroll": {
    "renderedCards": 7,
    "renderMode": "virtual",
    "hasVirtualWrapper": true,
    "wrapperClientHeight": 585,
    "wrapperScrollHeight": 70893,
    "wrapperStyleHeight": "min(72vh, 720px)",
    "contentStyleHeight": "70794px",
    "countText": "500 个"
  }
}
```

Headless Chrome 只记录到浏览器建议级 verbose 提示（密码输入框不在 form 内），没有阻塞性 JS exception。

## 结论

虚拟滚动代码路径已触发：

```text
renderMode = virtual
hasVirtualWrapper = true
```

Phase 4 前的基线问题是：500 条书签会渲染 500 张 `.bookmark-card`，因为内部滚动容器使用 `height: 100%`，在页面布局中被撑成接近全量内容高度。

Phase 4 后：

```text
initial renderedCards = 6
shown after scroll renderedCards = 7
wrapperClientHeight = 585
wrapperStyleHeight = min(72vh, 720px)
```

验收标准达成：

```text
500 条书签时 .bookmark-card DOM 数量 < 100
```
