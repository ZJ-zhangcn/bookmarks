/**
 * Multi-server system monitor helpers.
 * Keeps the current local metrics API compatible while allowing remote agents
 * to push Nezha-like heartbeat snapshots.
 */

const ONLINE_TTL_MS = 60 * 1000;
const OFFLINE_TTL_MS = 5 * 60 * 1000;

function clampPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

function toNonNegativeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeResource(raw = {}) {
    const total = toNonNegativeNumber(raw.total);
    const used = toNonNegativeNumber(raw.used);
    const free = raw.free === undefined ? Math.max(total - used, 0) : toNonNegativeNumber(raw.free);
    const usagePercent = raw.usagePercent === undefined
        ? (total > 0 ? clampPercent((used / total) * 100) : 0)
        : clampPercent(raw.usagePercent);
    return { total, used, free, usagePercent };
}

function getServerStatus(lastSeen, now = Date.now()) {
    const ts = Number(lastSeen);
    if (!Number.isFinite(ts) || ts <= 0) return 'offline';
    const age = now - ts;
    if (age <= ONLINE_TTL_MS) return 'online';
    if (age <= OFFLINE_TTL_MS) return 'stale';
    return 'offline';
}

function normalizeAgentReport(report = {}, receivedAt = Date.now()) {
    const metrics = report.metrics && typeof report.metrics === 'object' ? report.metrics : report;
    const cpu = metrics.cpu || {};
    const explicitLastSeen = report.lastSeen !== undefined ? report.lastSeen : report.last_seen;
    const lastSeen = explicitLastSeen === undefined ? receivedAt : Number(explicitLastSeen);
    return {
        id: String(report.id || report.name || 'unknown').trim().slice(0, 43) || 'unknown',
        name: String(report.name || report.id || 'Unknown').trim().slice(0, 80) || 'Unknown',
        role: String(report.role || '').trim().slice(0, 80),
        region: String(report.region || '').trim().slice(0, 80),
        status: getServerStatus(lastSeen, receivedAt),
        lastSeen,
        uptime: toNonNegativeNumber(metrics.uptime),
        load: Array.isArray(metrics.load) ? metrics.load.slice(0, 3).map(v => toNonNegativeNumber(v)) : [],
        cpu: {
            usage: clampPercent(cpu.usage),
            cores: Math.max(0, Math.round(toNonNegativeNumber(cpu.cores)))
        },
        memory: normalizeResource(metrics.memory || {}),
        disk: normalizeResource(metrics.disk || {})
    };
}

function sanitizeServerConfig(input = {}) {
    const id = String(input.id || '').trim();
    if (!/^[a-zA-Z0-9._:-]{1,43}$/.test(id)) {
        throw new Error('服务器 ID 格式不合法：1-43 位，仅支持字母、数字、点、下划线、冒号和短横线');
    }
    const name = String(input.name || id).trim().slice(0, 80) || id;
    return {
        id,
        name,
        region: String(input.region || '').trim().slice(0, 80),
        role: String(input.role || '').trim().slice(0, 80),
        enabled: input.enabled !== false
    };
}

function mergeServerConfigs(existing = [], incoming = []) {
    const existingById = new Map();
    for (const item of existing) {
        try {
            const config = sanitizeServerConfig(item);
            existingById.set(config.id, config);
        } catch {
            // Ignore invalid historical config entries.
        }
    }
    const merged = [];
    const seen = new Set();
    for (const item of incoming) {
        const next = sanitizeServerConfig(item);
        if (seen.has(next.id)) continue;
        const prev = existingById.get(next.id) || {};
        merged.push({
            id: next.id,
            name: next.name || prev.name || next.id,
            region: next.region || prev.region || '',
            role: next.role || prev.role || '',
            enabled: next.enabled
        });
        seen.add(next.id);
    }
    return merged;
}

function applyConfig(server, config) {
    if (!server || !config) return server;
    return {
        ...server,
        name: config.name || server.name,
        region: config.region || server.region,
        role: config.role || server.role,
        configured: true
    };
}

function emptyConfiguredServer(config, now) {
    return applyConfig(normalizeAgentReport({
        id: config.id,
        name: config.name,
        role: config.role,
        region: config.region,
        lastSeen: 0,
        metrics: {}
    }, now), config);
}

function buildServerList({ local, agents = [], configs = [], now = Date.now() }) {
    const byId = new Map();
    const ordered = [];
    const configById = new Map();
    const hasExplicitConfigs = Array.isArray(configs) && configs.length > 0;
    for (const item of configs) {
        try {
            const config = sanitizeServerConfig(item);
            if (config.enabled === false) continue;
            configById.set(config.id, config);
            ordered.push(config.id);
        } catch {
            // Ignore invalid config entries from old data.
        }
    }
    if (!hasExplicitConfigs) {
        const localId = local ? normalizeAgentReport({ ...local, lastSeen: now }, now).id : '';
        const addAutoConfig = (server) => {
            if (!server || configById.has(server.id)) return;
            configById.set(server.id, {
                id: server.id,
                name: server.name,
                region: server.region,
                role: server.role,
                enabled: true
            });
            ordered.push(server.id);
        };
        if (local) addAutoConfig(normalizeAgentReport({ ...local, lastSeen: now }, now));
        for (const agent of agents) {
            const normalized = normalizeAgentReport(agent, now);
            if (normalized.id === localId) continue;
            addAutoConfig(normalized);
        }
    }
    const shouldShow = id => !hasExplicitConfigs || configById.has(id);

    if (local) {
        const normalizedLocal = normalizeAgentReport({ ...local, lastSeen: now }, now);
        if (shouldShow(normalizedLocal.id)) {
            if (!ordered.includes(normalizedLocal.id)) ordered.unshift(normalizedLocal.id);
            byId.set(normalizedLocal.id, applyConfig(normalizedLocal, configById.get(normalizedLocal.id)));
        }
    }
    for (const agent of agents) {
        const normalized = normalizeAgentReport(agent, now);
        if (!shouldShow(normalized.id) || byId.has(normalized.id)) continue;
        normalized.status = getServerStatus(normalized.lastSeen, now);
        if (!ordered.includes(normalized.id)) ordered.push(normalized.id);
        byId.set(normalized.id, applyConfig(normalized, configById.get(normalized.id)));
    }
    for (const id of ordered) {
        if (!byId.has(id) && configById.has(id)) {
            byId.set(id, emptyConfiguredServer(configById.get(id), now));
        }
    }
    return ordered.map(id => byId.get(id)).filter(Boolean).sort((a, b) => {
        const statusOrder = { online: 0, stale: 1, offline: 2 };
        const diff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
        if (diff !== 0) return diff;
        return ordered.indexOf(a.id) - ordered.indexOf(b.id);
    });
}

module.exports = {
    ONLINE_TTL_MS,
    OFFLINE_TTL_MS,
    clampPercent,
    normalizeResource,
    sanitizeServerConfig,
    mergeServerConfigs,
    normalizeAgentReport,
    buildServerList,
    getServerStatus
};
