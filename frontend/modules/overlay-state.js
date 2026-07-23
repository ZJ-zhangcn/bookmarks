/**
 * Shared modal-stack state for overlays that lock document scrolling.
 */
import { DOM } from './dom.js';

function isOpen(overlay) {
    return Boolean(overlay?.classList?.contains?.('open'));
}

function getOpenOverlays() {
    const overlays = [
        DOM.engineModal,
        DOM.bookmarkModal,
        DOM.categoryModal,
        DOM.settingsModal,
        DOM.todoModal,
        DOM.categorySheetOverlay,
        DOM.confirmOverlay,
        DOM.globalSearchOverlay,
        document.querySelector?.('.command-palette-overlay.open')
    ];
    return overlays.filter(isOpen);
}

function getOverlayZIndex(overlay) {
    const computedZIndex = globalThis.getComputedStyle?.(overlay)?.zIndex;
    const zIndex = Number.parseInt(computedZIndex || overlay?.style?.zIndex, 10);
    return Number.isFinite(zIndex) ? zIndex : 0;
}

function followsInDocument(currentOverlay, candidateOverlay) {
    const position = currentOverlay?.compareDocumentPosition?.(candidateOverlay);
    return Boolean(position & 4); // Node.DOCUMENT_POSITION_FOLLOWING
}

export function hasOpenModalOrOverlay({ exclude = [] } = {}) {
    const excluded = new Set(exclude);
    return getOpenOverlays().some(overlay => !excluded.has(overlay));
}

/**
 * Whether an open overlay is visually above the given overlay and therefore owns keyboard focus.
 */
export function hasForegroundOverlayAbove(currentOverlay) {
    const currentZIndex = getOverlayZIndex(currentOverlay);
    return getOpenOverlays().some(overlay => {
        if (overlay === currentOverlay) return false;
        const overlayZIndex = getOverlayZIndex(overlay);
        return overlayZIndex > currentZIndex
            || (overlayZIndex === currentZIndex && followsInDocument(currentOverlay, overlay));
    });
}

export function isConfirmOverlayOpen() {
    return isOpen(DOM.confirmOverlay);
}

export function syncDocumentScrollLock() {
    if (!document.body?.style) return;
    document.body.style.overflow = hasOpenModalOrOverlay() ? 'hidden' : '';
}
