# renderBookmarks 增量更新优化

## 概述
优化 `frontend/modules/render.js` 中的 `renderBookmarks()` 函数，消除全量 DOM 重建，实现增量更新。

## 问题分析
- **当前问题**: 第 42 行 `DOM.bookmarksContainer.innerHTML = ''` 每次切换分类都会销毁并重建所有 DOM
- **性能影响**: 大量书签时造成明显卡顿，IntersectionObserver 需要重新绑定

## 实施方案 (Gemini 推荐: Option B - 增量 DOM 更新)

### 1. 状态扩展 (`frontend/modules/state.js`)
```javascript
// 新增 dataVersion 脏标记
export const state = {
  // ... existing properties
  dataVersion: 0,  // 数据变更版本号
};

// 新增版本递增函数
export function bumpDataVersion() {
  state.dataVersion++;
}
```

### 2. 重构 renderBookmarks (`frontend/modules/render.js`)

#### 2.1 新增辅助函数
```javascript
function createCategorySection(category, isCollapsed, idx) {
  const section = document.createElement('div');
  section.className = 'category-section';
  section.dataset.categoryId = category.id;
  section.innerHTML = `
    <div class="category-header" data-category-id="${category.id}">
      <span class="collapse-icon">${isCollapsed ? '▶' : '▼'}</span>
      <span>${escapeHtml(category.name)}</span>
    </div>
    <div class="bookmarks-grid" style="${isCollapsed ? 'display:none' : ''}"></div>
  `;
  return section;
}
```

#### 2.2 渲染逻辑重构
```javascript
let lastRenderedVersion = -1;
let lastSearchMode = false;

export function renderBookmarks(categories, bookmarks) {
  const isSearchMode = !!state.searchKeyword;
  const needsFullRebuild =
    lastRenderedVersion !== state.dataVersion ||
    lastSearchMode !== isSearchMode ||
    DOM.bookmarksContainer.children.length === 0;

  if (needsFullRebuild) {
    // 全量重建 (仅在数据变更或搜索模式切换时)
    DOM.bookmarksContainer.innerHTML = '';
    // ... 现有创建逻辑
    lastRenderedVersion = state.dataVersion;
    lastSearchMode = isSearchMode;
  } else {
    // 增量更新: 仅切换 CSS visibility
    updateCategoryVisibility(state.currentCategory);
  }
}

function updateCategoryVisibility(activeCategory) {
  const sections = DOM.bookmarksContainer.querySelectorAll('.category-section');
  sections.forEach(section => {
    const shouldShow = activeCategory === 'all' ||
                       section.dataset.categoryId === String(activeCategory);
    section.style.display = shouldShow ? '' : 'none';
  });
}
```

### 3. 调用点更新
在数据变更时调用 `bumpDataVersion()`:
- `api.js` 中 CRUD 操作成功后
- 拖拽排序完成后
- 导入数据后

## 预期效果
- 分类切换: O(n) DOM 操作 → O(1) CSS toggle
- 首次渲染/数据变更: 保持现有逻辑
- IntersectionObserver: 无需重新绑定

## 兼容性
- 保留现有 `observeBookmarkIcons` 懒加载逻辑
- 保留折叠状态持久化
- 搜索模式仍触发全量渲染
