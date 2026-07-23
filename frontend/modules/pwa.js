const SERVICE_WORKER_VERSION = 'v18';

/**
 * PWA 注册模块
 */
export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext && window.location.hostname !== 'localhost') return;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`/service-worker.js?${SERVICE_WORKER_VERSION}`)
            .catch(error => {
                console.warn('Service Worker 注册失败:', error);
            });
    });
}
