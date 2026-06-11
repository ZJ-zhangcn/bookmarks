/**
 * 服务健康检查器
 */
const { assertPublicFetchUrl } = require('../middleware/security');
const { safeFetch } = require('../utils/safe-fetch');
const serviceStatus = require('../../shared/services/service-status');

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_CONCURRENCY = 5;

function createDownResult(service, startedAt, error) {
    return {
        service_id: service.id,
        status: 'down',
        http_status: null,
        latency_ms: Math.max(0, Date.now() - startedAt),
        error_message: String(error?.message || error || '检查失败').slice(0, 500),
        checked_at: new Date().toISOString()
    };
}

async function checkService(service, options = {}) {
    const startedAt = Date.now();
    try {
        const parsed = await assertPublicFetchUrl(service.url);
        const response = await (options.fetchImpl || safeFetch)(parsed.href, {
            method: 'GET',
            timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
            headers: {
                Accept: 'text/html,application/json,text/plain,*/*;q=0.8'
            }
        });
        const latencyMs = Math.max(0, Date.now() - startedAt);
        return {
            service_id: service.id,
            status: response.ok ? 'ok' : 'down',
            http_status: response.status || null,
            latency_ms: latencyMs,
            error_message: response.ok ? '' : `HTTP ${response.status}`,
            checked_at: new Date().toISOString()
        };
    } catch (error) {
        return createDownResult(service, startedAt, error);
    }
}

async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let cursor = 0;
    const workerCount = Math.min(Math.max(1, limit), items.length || 1);

    async function worker() {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await mapper(items[index], index);
        }
    }

    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
}

async function checkServices(db, services, options = {}) {
    const list = Array.isArray(services) ? services : [];
    const concurrency = Number(options.concurrency || DEFAULT_CONCURRENCY);
    const results = await mapWithConcurrency(list, concurrency, service => checkService(service, options));
    for (const result of results) {
        await serviceStatus.saveStatusResult(db, result);
    }
    return results;
}

async function checkAllEnabledServices(db, options = {}) {
    const services = await serviceStatus.getEnabledServices(db);
    return checkServices(db, services, options);
}

async function checkServiceById(db, id, options = {}) {
    const service = await serviceStatus.getServiceById(db, id);
    if (!service) {
        const err = new Error('监控服务不存在');
        err.statusCode = 404;
        throw err;
    }
    const [result] = await checkServices(db, [service], options);
    return result;
}

function startServiceStatusScheduler(db, options = {}) {
    const intervalMs = options.intervalMs || 60000;
    let running = false;

    async function tick() {
        if (running) return;
        running = true;
        try {
            await checkAllEnabledServices(db, options);
        } catch (error) {
            console.warn('[service-status] 定时健康检查失败:', error.message);
        } finally {
            running = false;
        }
    }

    const timer = setInterval(tick, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    setTimeout(tick, 1000).unref?.();
    return {
        stop() {
            clearInterval(timer);
        },
        tick
    };
}

module.exports = {
    DEFAULT_TIMEOUT_MS,
    DEFAULT_CONCURRENCY,
    checkService,
    checkServices,
    checkAllEnabledServices,
    checkServiceById,
    startServiceStatusScheduler
};
