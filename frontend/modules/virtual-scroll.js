/**
 * 虚拟滚动模块 - 高性能大列表渲染
 * 仅渲染可见区域的书签卡片
 */

export class VirtualScroll {
    constructor(options) {
        this.container = options.container; // 滚动容器
        this.items = []; // 所有数据项
        this.renderItem = options.renderItem; // 渲染函数
        this.itemHeight = options.itemHeight || 140; // 预估卡片高度
        this.bufferSize = options.bufferSize || 3; // 缓冲区大小（上下各渲染N行）
        this.columnsCount = options.columnsCount || 4; // 列数

        // 状态
        this.scrollTop = 0;
        this.viewportHeight = 0;
        this.totalHeight = 0;
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.renderStart = 0;
        this.renderEnd = 0;

        // 滚动优化
        this.rafId = null;
        this.scrollTimeout = null;

        // 高度缓存（支持动态高度）
        this.itemHeights = new Map();
        this.measuredRows = new Set();

        // DOM 节点
        this.wrapper = null;
        this.content = null;

        this.init();
    }

    init() {
        // 创建虚拟滚动容器结构
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'virtual-scroll-wrapper';
        this.wrapper.style.position = 'relative';
        this.wrapper.style.overflow = 'auto';
        this.wrapper.style.height = '100%';

        this.content = document.createElement('div');
        this.content.className = 'virtual-scroll-content';
        this.content.style.position = 'relative';

        this.wrapper.appendChild(this.content);

        // 监听滚动
        this.wrapper.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });

        // 监听窗口大小变化
        this.resizeObserver = new ResizeObserver(() => {
            this.updateViewport();
            this.render();
        });
        this.resizeObserver.observe(this.wrapper);
    }

    /**
     * 挂载到容器
     */
    mount(container) {
        if (container) {
            this.container = container;
        }
        if (this.container) {
            this.container.appendChild(this.wrapper);
            this.updateViewport();
        }
    }

    /**
     * 卸载
     */
    unmount() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.wrapper.parentNode) {
            this.wrapper.parentNode.removeChild(this.wrapper);
        }
    }

    /**
     * 更新数据
     */
    setItems(items) {
        this.items = items;
        this.itemHeights.clear();
        this.measuredRows.clear();
        this.updateTotalHeight();
        this.render();
    }

    /**
     * 更新列数（响应式）
     */
    setColumnsCount(count) {
        if (this.columnsCount !== count) {
            this.columnsCount = count;
            this.itemHeights.clear();
            this.measuredRows.clear();
            this.updateTotalHeight();
            this.render();
        }
    }

    /**
     * 更新视口信息
     */
    updateViewport() {
        this.viewportHeight = this.wrapper.clientHeight;
        this.scrollTop = this.wrapper.scrollTop;

        // 响应式列数
        const width = this.wrapper.clientWidth;
        let cols = 4;
        if (width < 640) cols = 1;
        else if (width < 1024) cols = 2;
        else if (width < 1440) cols = 3;
        this.setColumnsCount(cols);
    }

    /**
     * 计算总高度
     */
    updateTotalHeight() {
        const rowCount = Math.ceil(this.items.length / this.columnsCount);

        // 如果有测量过的高度，使用精确值
        let totalHeight = 0;
        for (let row = 0; row < rowCount; row++) {
            if (this.measuredRows.has(row)) {
                totalHeight += this.getRowHeight(row);
            } else {
                totalHeight += this.itemHeight;
            }
        }

        this.totalHeight = totalHeight;
        this.content.style.height = `${this.totalHeight}px`;
    }

    /**
     * 获取行高度
     */
    getRowHeight(row) {
        // 检查该行是否有测量过的高度
        const startIdx = row * this.columnsCount;
        const endIdx = Math.min(startIdx + this.columnsCount, this.items.length);

        let maxHeight = this.itemHeight;
        for (let i = startIdx; i < endIdx; i++) {
            const height = this.itemHeights.get(i);
            if (height) {
                maxHeight = Math.max(maxHeight, height);
            }
        }

        return maxHeight;
    }

    /**
     * 计算可见范围
     */
    calculateVisibleRange() {
        const rowCount = Math.ceil(this.items.length / this.columnsCount);

        // 计算可见的行范围
        let currentTop = 0;
        let visibleStartRow = 0;
        let visibleEndRow = 0;

        for (let row = 0; row < rowCount; row++) {
            const rowHeight = this.getRowHeight(row);
            const rowBottom = currentTop + rowHeight;

            if (rowBottom >= this.scrollTop && visibleStartRow === 0) {
                visibleStartRow = row;
            }

            if (currentTop <= this.scrollTop + this.viewportHeight) {
                visibleEndRow = row + 1;
            } else {
                break;
            }

            currentTop = rowBottom;
        }

        // 添加缓冲区
        const renderStartRow = Math.max(0, visibleStartRow - this.bufferSize);
        const renderEndRow = Math.min(rowCount, visibleEndRow + this.bufferSize);

        this.visibleStart = visibleStartRow * this.columnsCount;
        this.visibleEnd = visibleEndRow * this.columnsCount;
        this.renderStart = renderStartRow * this.columnsCount;
        this.renderEnd = Math.min(this.items.length, renderEndRow * this.columnsCount);
    }

    /**
     * 渲染内容
     */
    render() {
        if (!this.items.length) {
            this.content.innerHTML = '';
            return;
        }

        this.calculateVisibleRange();

        // 计算渲染起始位置的 top 偏移
        const startRow = Math.floor(this.renderStart / this.columnsCount);
        let offsetTop = 0;
        for (let row = 0; row < startRow; row++) {
            offsetTop += this.getRowHeight(row);
        }

        // 创建容器
        const fragment = document.createDocumentFragment();
        const grid = document.createElement('div');
        grid.className = 'bookmarks-grid virtual-grid';
        grid.style.position = 'absolute';
        grid.style.top = `${offsetTop}px`;
        grid.style.left = '0';
        grid.style.right = '0';
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = `repeat(${this.columnsCount}, 1fr)`;
        grid.style.gap = '1rem';

        // 渲染可见项
        for (let i = this.renderStart; i < this.renderEnd; i++) {
            const item = this.items[i];
            if (!item) continue;

            const element = this.renderItem(item, i);
            if (element) {
                grid.appendChild(element);
            }
        }

        fragment.appendChild(grid);

        // 更新 DOM
        this.content.innerHTML = '';
        this.content.appendChild(fragment);

        // 测量实际高度
        requestAnimationFrame(() => {
            this.measureItems();
        });
    }

    /**
     * 测量已渲染项的实际高度
     */
    measureItems() {
        const cards = this.content.querySelectorAll('.bookmark-card');
        let needsUpdate = false;

        cards.forEach((card, idx) => {
            const itemIndex = this.renderStart + idx;
            const row = Math.floor(itemIndex / this.columnsCount);

            if (!this.measuredRows.has(row)) {
                const height = card.offsetHeight;
                const oldHeight = this.itemHeights.get(itemIndex);

                if (!oldHeight || Math.abs(height - oldHeight) > 1) {
                    this.itemHeights.set(itemIndex, height);
                    needsUpdate = true;
                }

                // 标记该行为已测量
                if (idx % this.columnsCount === this.columnsCount - 1 || itemIndex === this.items.length - 1) {
                    this.measuredRows.add(row);
                }
            }
        });

        // 如果高度有变化，重新计算总高度
        if (needsUpdate) {
            this.updateTotalHeight();
        }
    }

    /**
     * 处理滚动事件
     */
    handleScroll() {
        // 防抖 + RAF 优化
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }

        this.scrollTimeout = setTimeout(() => {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
            }

            this.rafId = requestAnimationFrame(() => {
                this.updateViewport();
                this.render();
                this.rafId = null;
            });
        }, 16); // ~60fps
    }

    /**
     * 滚动到指定位置
     */
    scrollToIndex(index, behavior = 'smooth') {
        const row = Math.floor(index / this.columnsCount);
        let offsetTop = 0;

        for (let r = 0; r < row; r++) {
            offsetTop += this.getRowHeight(r);
        }

        this.wrapper.scrollTo({
            top: offsetTop,
            behavior: behavior
        });
    }

    /**
     * 滚动到顶部
     */
    scrollToTop(behavior = 'smooth') {
        this.wrapper.scrollTo({
            top: 0,
            behavior: behavior
        });
    }

    /**
     * 获取滚动位置
     */
    getScrollPosition() {
        return {
            scrollTop: this.wrapper.scrollTop,
            scrollHeight: this.wrapper.scrollHeight,
            clientHeight: this.wrapper.clientHeight
        };
    }

    /**
     * 恢复滚动位置
     */
    restoreScrollPosition(scrollTop) {
        this.wrapper.scrollTop = scrollTop;
    }
}

/**
 * 创建虚拟滚动实例（工厂函数）
 */
export function createVirtualScroll(options) {
    return new VirtualScroll(options);
}
