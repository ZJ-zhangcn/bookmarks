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
    const lastSeen = Number(report.lastSeen || report.last_seen || receivedAt);
    return {
        id: String(report.id || report.name || 'unknown').trim().slice(0, 80) || 'unknown',
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

function buildServerList({ local, agents = [], now = Date.now() }) {
    const byId = new Map();
    const ordered = [];
    if (local) {
        const normalizedLocal = normalizeAgentReport({ ...local, lastSeen: now }, now);
        byId.set(normalizedLocal.id, normalizedLocal);
        ordered.push(normalizedLocal.id);
    }
    for (const agent of agents) {
        const normalized = normalizeAgentReport(agent, now);
        if (byId.has(normalized.id)) continue;
        normalized.status = getServerStatus(normalized.lastSeen, now);
        ordered.push(normalized.id);
        byId.set(normalized.id, normalized);
    }
    return ordered.map(id => byId.get(id)).filter(Boolean).sort((a, b) => {
        const statusOrder = { online: 0, stale: 1, offline: 2 };
        return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    });
}

module.exports = {
    ONLINE_TTL_MS,
    OFFLINE_TTL_MS,
    clampPercent,
    normalizeResource,
    normalizeAgentReport,
    buildServerList,
    getServerStatus
};
