const { assertPublicFetchUrl } = require('../middleware/security');

const jobs = new WeakMap();

function initialState() {
    return { state: 'idle', total: 0, completed: 0, healthy: 0, warning: 0, failed: 0, startedAt: null, finishedAt: null };
}

function getJob(db) {
    if (!jobs.has(db)) jobs.set(db, { ...initialState(), paused: false, queue: [] });
    return jobs.get(db);
}

function publicJob(job) {
    const { paused: _paused, queue: _queue, ...status } = job;
    return status;
}

async function fetchWithTimeout(url, options, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, redirect: 'manual', signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function probe(rawUrl) {
    try {
        const url = await assertPublicFetchUrl(rawUrl);
        let response;
        response = await fetchWithTimeout(url, { method: 'HEAD', headers: { 'User-Agent': 'BookmarkHealthChecker/1.0' } });
        if ([405, 501].includes(response.status)) {
            response = await fetchWithTimeout(url, {
                method: 'GET',
                headers: { 'User-Agent': 'BookmarkHealthChecker/1.0', Range: 'bytes=0-1023' }
            });
        }
        const statusCode = response.status;
        await response.body?.cancel?.().catch(() => {});
        if (statusCode >= 200 && statusCode < 400) return { state: 'healthy', statusCode, error: '' };
        if ([401, 403, 429].includes(statusCode)) return { state: 'warning', statusCode, error: '需要人工确认' };
        return { state: 'failed', statusCode, error: `HTTP ${statusCode}` };
    } catch (error) {
        return { state: 'failed', statusCode: null, error: error.name === 'AbortError' ? '请求超时' : error.message };
    }
}

async function persistResult(db, url, result) {
    const previous = await db.queryOne('SELECT consecutive_failures FROM bookmark_link_health WHERE url = ?', [url]);
    const failures = result.state === 'failed' ? (Number(previous?.consecutive_failures) || 0) + 1 : 0;
    const persistedState = result.state === 'failed' && failures < 2 ? 'warning' : result.state;
    await db.execute(
        `INSERT INTO bookmark_link_health (url, state, status_code, consecutive_failures, error, checked_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(url) DO UPDATE SET state = excluded.state, status_code = excluded.status_code,
           consecutive_failures = excluded.consecutive_failures, error = excluded.error, checked_at = CURRENT_TIMESTAMP`,
        [url, persistedState, result.statusCode, failures, result.error || '']
    );
    return persistedState;
}

async function worker(db, queue, job, options) {
    while (queue.length > 0) {
        if (job.paused) return;
        const bookmark = queue.shift();
        const result = await (options.probe || probe)(bookmark.url);
        const state = await persistResult(db, bookmark.url, result);
        job.completed += 1;
        if (state === 'healthy') job.healthy += 1;
        else if (state === 'warning') job.warning += 1;
        else job.failed += 1;
    }
}

async function run(db, options = {}) {
    const job = getJob(db);
    if (job.paused && job.state === 'paused') return;
    if (job.state === 'running') return;
    let queue = job.queue;
    if (!queue.length) {
        const bookmarks = await db.queryAll(`
            SELECT id, name, url FROM bookmarks
            WHERE COALESCE(item_type, 'bookmark') <> 'component' AND TRIM(COALESCE(url, '')) <> ''
            ORDER BY created_at, id
        `);
        queue = [...bookmarks];
        Object.assign(job, initialState(), {
            state: 'running', total: bookmarks.length, startedAt: new Date().toISOString(), paused: false, queue
        });
    } else {
        job.state = 'running';
        job.paused = false;
    }
    try {
        await Promise.all(Array.from({ length: Math.min(3, queue.length || 1) }, () => worker(db, queue, job, options)));
        job.state = job.paused ? 'paused' : 'complete';
        if (!job.paused) job.queue = [];
    } catch (error) {
        job.state = 'error';
        job.error = error.message;
    }
    job.finishedAt = new Date().toISOString();
}

function start(db, options = {}) {
    const job = getJob(db);
    if (job.state === 'running' || job.state === 'starting') return publicJob(job);
    setImmediate(() => run(db, options));
    if (job.state === 'paused' && job.queue.length) {
        job.state = 'starting';
        job.paused = false;
    } else {
        Object.assign(job, initialState(), { state: 'starting', startedAt: new Date().toISOString(), paused: false, queue: [] });
    }
    return publicJob(job);
}

function pause(db) {
    const job = getJob(db);
    if (job.state === 'running' || job.state === 'starting') job.paused = true;
    job.state = 'paused';
    return publicJob(job);
}

async function listResults(db) {
    return db.queryAll(`
        SELECT h.url, h.state, h.status_code, h.consecutive_failures, h.error, h.checked_at,
               GROUP_CONCAT(b.name, '、') AS bookmark_names
        FROM bookmark_link_health h
        LEFT JOIN bookmarks b ON b.url = h.url
        GROUP BY h.url
        ORDER BY CASE h.state WHEN 'failed' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, h.checked_at DESC
    `);
}

module.exports = { probe, persistResult, run, start, pause, getStatus: db => publicJob(getJob(db)), listResults };
