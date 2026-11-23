/**
 * 网页搜索吸顶布局：分类标题与滚动定位复用实际栏高。
 */
export function initWebSearchSticky(container) {
    const page = container?.closest('.container');
    if (!page) return;

    const update = () => {
        const rect = container.getBoundingClientRect();
        const style = getComputedStyle(container);
        const top = parseFloat(style.top) || 0;
        const gap = parseFloat(style.marginBottom) || 0;
        const offset = rect.height > 0 ? Math.ceil(rect.height + top + gap) : 0;
        page.style.setProperty('--web-search-offset', `${offset}px`);
        container.classList.toggle('is-stuck', rect.height > 0 && rect.top <= top + 1);
    };

    update();
    if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(update);
        observer.observe(container);
    }
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('scroll', update, { passive: true });
}
