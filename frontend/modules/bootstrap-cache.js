const DB_NAME = 'bookmark-nav-cache';
const STORE_NAME = 'bootstrap';
const KEY = 'latest';

function openCache() {
    if (!('indexedDB' in globalThis)) return Promise.resolve(null);
    return new Promise(resolve => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
}

export async function readBootstrapCache() {
    const db = await openCache();
    if (!db) return null;
    return new Promise(resolve => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
    });
}

export async function writeBootstrapCache(data) {
    const db = await openCache();
    if (!db) return;
    await new Promise(resolve => {
        const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ data, savedAt: new Date().toISOString() }, KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
    });
}

export async function clearBootstrapCache() {
    if (!('indexedDB' in globalThis)) return;
    await new Promise(resolve => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
}
