import { showActionToast } from './ux.js';

const SERVICE_WORKER_VERSION = 'v17';

let refreshRequested = false;
let updateToastShown = false;

export function promptForUpdate(worker) {
    if (!worker || updateToastShown) return;
    updateToastShown = true;
    showActionToast('发现新版本', '立即刷新', toast => {
        refreshRequested = true;
        toast?.remove?.();
        worker.postMessage({ type: 'SKIP_WAITING' });
    }, { type: 'info' });
}

function watchRegistration(registration) {
    if (registration.waiting && navigator.serviceWorker.controller) {
        promptForUpdate(registration.waiting);
    }
    registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                promptForUpdate(registration.waiting || installingWorker);
            }
        });
    });
}

/**
 * PWA 注册模块
 */
export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext && window.location.hostname !== 'localhost') return;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`/service-worker.js?${SERVICE_WORKER_VERSION}`)
            .then(registration => {
                watchRegistration(registration);
                registration.update().catch(() => {});
            })
            .catch(error => {
                console.warn('Service Worker 注册失败:', error);
            });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshRequested) return;
        refreshRequested = false;
        window.location.reload();
    });
}
