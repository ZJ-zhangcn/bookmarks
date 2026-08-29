function normalizeIds(ids) {
    return [...new Set((Array.isArray(ids) ? ids : [])
        .map(id => String(id || '').trim())
        .filter(Boolean))];
}

function createIconLoadQueue(options = {}) {
    const loadBatch = options.loadBatch;
    if (typeof loadBatch !== 'function') throw new TypeError('loadBatch must be a function');

    const batchSize = Math.max(1, Number(options.batchSize) || 20);
    const maxConcurrent = Math.max(1, Number(options.maxConcurrent) || 1);
    const maxRetries = Math.max(0, Number(options.maxRetries) || 0);
    const isResolved = typeof options.isResolved === 'function' ? options.isResolved : () => false;
    const onResult = typeof options.onResult === 'function' ? options.onResult : () => {};
    const onError = typeof options.onError === 'function' ? options.onError : () => {};

    const pending = [];
    const pendingIds = new Set();
    const inFlightIds = new Set();
    const attempts = new Map();
    const idleWaiters = [];
    let active = 0;
    let scheduled = false;

    function has(id) {
        const normalized = String(id || '').trim();
        return Boolean(normalized) && (pendingIds.has(normalized) || inFlightIds.has(normalized));
    }

    function resolveIdleWaiters() {
        if (active > 0 || pending.length > 0 || scheduled) return;
        while (idleWaiters.length > 0) idleWaiters.shift()();
    }

    function scheduleDrain() {
        if (scheduled) return;
        scheduled = true;
        globalThis.queueMicrotask(() => {
            scheduled = false;
            drain();
        });
    }

    function retryOrFail(batch, error) {
        const failed = [];
        for (const id of batch) {
            const nextAttempt = (attempts.get(id) || 0) + 1;
            attempts.set(id, nextAttempt);
            if (nextAttempt <= maxRetries && !isResolved(id)) {
                pending.push(id);
                pendingIds.add(id);
            } else {
                attempts.delete(id);
                failed.push(id);
            }
        }
        if (failed.length > 0) onError(failed, error);
    }

    function runBatch(batch) {
        active += 1;
        batch.forEach(id => inFlightIds.add(id));

        Promise.resolve()
            .then(() => loadBatch(batch))
            .then(result => {
                batch.forEach(id => attempts.delete(id));
                onResult(batch, result || {});
            })
            .catch(error => retryOrFail(batch, error))
            .finally(() => {
                batch.forEach(id => inFlightIds.delete(id));
                active -= 1;
                drain();
            });
    }

    function drain() {
        while (active < maxConcurrent && pending.length > 0) {
            const batch = [];
            while (batch.length < batchSize && pending.length > 0) {
                const id = pending.shift();
                pendingIds.delete(id);
                if (!id || isResolved(id) || inFlightIds.has(id)) continue;
                batch.push(id);
            }
            if (batch.length === 0) continue;
            runBatch(batch);
        }
        resolveIdleWaiters();
    }

    function enqueue(ids) {
        const accepted = [];
        for (const id of normalizeIds(ids)) {
            if (isResolved(id) || has(id)) continue;
            pending.push(id);
            pendingIds.add(id);
            accepted.push(id);
        }
        if (accepted.length > 0) scheduleDrain();
        return accepted;
    }

    function whenIdle() {
        if (active === 0 && pending.length === 0 && !scheduled) return Promise.resolve();
        return new Promise(resolve => idleWaiters.push(resolve));
    }

    return {
        enqueue,
        has,
        whenIdle,
        get pendingCount() { return pending.length; },
        get activeCount() { return active; }
    };
}

module.exports = { createIconLoadQueue, normalizeIds };
