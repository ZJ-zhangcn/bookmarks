# 虚拟滚动基线验证

日期：2026-06-11T09:56:00Z

## 验证方法

使用当前 `dist/` 构建产物启动临时静态服务，并用临时 API 返回 1 个分类 + 500 条书签。再通过 Headless Chrome 读取真实页面 DOM。

关键检查项：

```js
document.querySelectorAll('.bookmark-card').length
document.querySelector('.bookmarks-grid[data-category="bulk"]')?.dataset?.renderMode
```

## 实测结果

```json
{
  "ready": "complete",
  "title": "书签导航 | 我的常用网站",
  "totalBookmarks": 500,
  "renderedCards": 500,
  "renderMode": "virtual",
  "hasVirtualWrapper": true,
  "wrapperClientHeight": 72000,
  "wrapperScrollHeight": 80093,
  "innerGridCards": 500,
  "countText": "500 个",
  "errorEvents": []
}
```

## 结论

虚拟滚动代码路径已触发：

```text
renderMode = virtual
hasVirtualWrapper = true
```

但实际 DOM 仍渲染了全部 500 张卡片：

```text
renderedCards = 500
```

因此当前虚拟滚动**没有实际减少 DOM 数量**。原因方向是虚拟滚动容器高度异常：

```text
wrapperClientHeight = 72000
```

视口高度被计算成接近全量内容高度，导致 `calculateVisibleRange()` 认为所有行都可见，从而一次性渲染全部卡片。

## 处理建议

这项不阻塞 Phase 2 质量门禁，但满足 Phase 4 的触发条件：

```text
500+ 书签时 DOM 数量 = 书签总数
```

后续 Phase 4 应专项修复虚拟滚动容器高度/滚动根节点，验收标准应为：

```text
500 条书签时 .bookmark-card DOM 数量 < 100
```
