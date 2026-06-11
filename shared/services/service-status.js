/**
 * 服务状态共享业务逻辑
 */
const { newId } = require('./ids');

function isMysql(db) {
    return db.USE_MYSQL || db.getDatabaseType?.() === 'mysql';
}

function normalizeEnabled(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
}

function normalizeServiceRow(row) {
    if (!row) return null;
    return {
        ...row,
        enabled: normalizeEnabled(row.enabled),
        sort_order: Number(row.sort_order) || 0,
        http_status: row.http_status == null ? null : Number(row.http_status),
        latency_ms: row.latency_ms == null ? null : Number(row.latency_ms),
        status: row.status || 'unchecked',
        error_message: row.error_message || '',
        checked_at: row.checked_at || null
    };
}

function assertValidServiceInput({ name, url }) {
    const serviceName = String(name || '').trim();
    if (!serviceName) {
        const err = new Error('服务名称不能为空');
        err.statusCode = 400;
        throw err;
    }

    const rawUrl = String(url || '').trim();
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        const err = new Error('服务 URL 格式不合法');
        err.statusCode = 400;
        throw err;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        const err = new Error('服务 URL 仅允许 http/https 协议');
        err.statusCode = 400;
        throw err;
    }

    return { name: serviceName, url: rawUrl };
}

async function getServiceStatus(db) {
    const rows = await db.queryAll(`
        SELECT
            s.id,
            s.name,
            s.url,
            s.enabled,
            s.sort_order,
            s.created_at,
            s.updated_at,
            r.status,
            r.http_status,
            r.latency_ms,
            r.error_message,
            r.checked_at
        FROM monitored_services s
        LEFT JOIN service_status_results r ON r.service_id = s.id
        ORDER BY s.sort_order, s.created_at, s.name
    `);
    return rows.map(normalizeServiceRow);
}

async function getEnabledServices(db) {
    const rows = await db.queryAll(`
        SELECT id, name, url, enabled, sort_order, created_at, updated_at
        FROM monitored_services
        WHERE enabled = 1
        ORDER BY sort_order, created_at, name
    `);
    return rows.map(normalizeServiceRow);
}

async function getServiceById(db, id) {
    const row = await db.queryOne(
        `SELECT id, name, url, enabled, sort_order, created_at, updated_at
         FROM monitored_services
         WHERE id = ?`,
        [id]
    );
    return normalizeServiceRow(row);
}

async function saveService(db, input) {
    const { name, url } = assertValidServiceInput(input || {});
    const id = input.id || newId('svc');
    const enabled = input.enabled === undefined ? 1 : (normalizeEnabled(input.enabled) ? 1 : 0);
    let sortOrder = Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : null;

    if (sortOrder === null) {
        const row = await db.queryOne('SELECT MAX(sort_order) as max_order FROM monitored_services');
        sortOrder = (row?.max_order ?? -1) + 1;
    }

    if (isMysql(db)) {
        await db.execute(
            `INSERT INTO monitored_services (id, name, url, enabled, sort_order)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               url = VALUES(url),
               enabled = VALUES(enabled),
               sort_order = VALUES(sort_order),
               updated_at = CURRENT_TIMESTAMP`,
            [id, name, url, enabled, sortOrder]
        );
    } else {
        await db.execute(
            `INSERT INTO monitored_services (id, name, url, enabled, sort_order)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               url = excluded.url,
               enabled = excluded.enabled,
               sort_order = excluded.sort_order,
               updated_at = CURRENT_TIMESTAMP`,
            [id, name, url, enabled, sortOrder]
        );
    }

    return { id };
}

async function deleteService(db, id) {
    if (!id) {
        const err = new Error('缺少服务 ID');
        err.statusCode = 400;
        throw err;
    }
    await db.execute('DELETE FROM monitored_services WHERE id = ?', [id]);
}

async function saveStatusResult(db, result) {
    const serviceId = result.service_id || result.id;
    if (!serviceId) {
        const err = new Error('缺少服务 ID');
        err.statusCode = 400;
        throw err;
    }

    const status = ['ok', 'down', 'unchecked'].includes(result.status) ? result.status : 'down';
    const httpStatus = result.http_status == null ? null : Number(result.http_status);
    const latencyMs = result.latency_ms == null ? null : Math.max(0, Math.round(Number(result.latency_ms) || 0));
    const checkedAt = result.checked_at || new Date().toISOString();
    const errorMessage = String(result.error_message || '').slice(0, 500);

    if (isMysql(db)) {
        await db.execute(
            `INSERT INTO service_status_results (service_id, status, http_status, latency_ms, error_message, checked_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               status = VALUES(status),
               http_status = VALUES(http_status),
               latency_ms = VALUES(latency_ms),
               error_message = VALUES(error_message),
               checked_at = VALUES(checked_at)`,
            [serviceId, status, httpStatus, latencyMs, errorMessage, checkedAt]
        );
    } else {
        await db.execute(
            `INSERT INTO service_status_results (service_id, status, http_status, latency_ms, error_message, checked_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(service_id) DO UPDATE SET
               status = excluded.status,
               http_status = excluded.http_status,
               latency_ms = excluded.latency_ms,
               error_message = excluded.error_message,
               checked_at = excluded.checked_at`,
            [serviceId, status, httpStatus, latencyMs, errorMessage, checkedAt]
        );
    }

    return {
        service_id: serviceId,
        status,
        http_status: httpStatus,
        latency_ms: latencyMs,
        error_message: errorMessage,
        checked_at: checkedAt
    };
}

module.exports = {
    assertValidServiceInput,
    getServiceStatus,
    getEnabledServices,
    getServiceById,
    saveService,
    deleteService,
    saveStatusResult
};
