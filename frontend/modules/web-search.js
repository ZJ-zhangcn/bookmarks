/**
 * 网页搜索吸顶布局：分类标题与滚动定位复用实际栏高。
 */
export function initWebSearchSticky(container) {
    const page = container?.closest('.container');
    if (!page) return;

    const updateOffset = () => {
        const height = container.getBoundingClientRect().height;
        const style = getComputedStyle(container);
        const top = parseFloat(style.top) || 0;
        const gap = parseFloat(style.marginBottom) || 0;
        const offset = height > 0 ? Math.ceil(height + top + gap) : 0;
        page.style.setProperty('--web-search-offset', `${offset}px`);
    };

    updateOffset();
    if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(updateOffset);
        observer.observe(container);
    }
    window.addEventListener('resize', updateOffset, { passive: true });
}
