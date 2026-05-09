/**
 * 系统状态路由模块
 */
const express = require('express');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const router = express.Router();
const { requireStrictAdmin } = require('../middleware/security');
const { success, asyncHandler, AppError } = require('../utils');
const { normalizeAgentReport, buildServerList, mergeServerConfigs } = require('../../shared/services/system-monitor');

const HOST_PROC = process.env.HOST_PROC || '/proc';
const LOCAL_SERVER_ID = process.env.MONITOR_SERVER_ID || 'hk-vps';
const LOCAL_SERVER_NAME = process.env.MONITOR_SERVER_NAME || 'HK VPS';
const LOCAL_SERVER_REGION = process.env.MONITOR_SERVER_REGION || 'Hong Kong';
const LOCAL_SERVER_ROLE = process.env.MONITOR_SERVER_ROLE || 'bookmarks';
const AGENT_TOKENS = [process.env.MONITOR_AGENT_TOKEN, process.env.ADMIN_TOKEN]
    .map(value => String(value || '').trim())
    .filter(Boolean);
const agentReports = new Map();
let lastCpuTimes = null;
let diskCache = { data: null, timestamp: 0 };
const DISK_CACHE_TTL = 30000; // 磁盘信息缓存 30 秒

function getCpuUsageFromProc() {
    try {
        const statPath = `${HOST_PROC}/stat`;
        const content = fs.readFileSync(statPath, 'utf8');
        const firstLine = content.split('\n')[0];
        const parts = firstLine.split(/\s+/).slice(1).map(Number);

        const [user, nice, system, idle, iowait, irq, softirq, steal] = parts;
        const total = user + nice + system + idle + iowait + irq + softirq + steal;
        const idleTime = idle + iowait;

        if (!lastCpuTimes) {
            lastCpuTimes = { total, idle: idleTime };
            return 0;
        }

        const totalDiff = total - lastCpuTimes.total;
        const idleDiff = idleTime - lastCpuTimes.idle;
        lastCpuTimes = { total, idle: idleTime };

        if (totalDiff === 0) return 0;
        return Math.round((1 - idleDiff / totalDiff) * 100 * 100) / 100;
    } catch {
        const cpus = os.cpus();
        let totalIdle = 0, totalTick = 0;
        cpus.forEach(cpu => {
            for (const type in cpu.times) totalTick += cpu.times[type];
            totalIdle += cpu.times.idle;
        });
        return totalTick > 0 ? Math.round((1 - totalIdle / totalTick) * 100 * 100) / 100 : 0;
    }
}

function getMemoryFromProc() {
    try {
        const memPath = `${HOST_PROC}/meminfo`;
        const content = fs.readFileSync(memPath, 'utf8');
        const lines = content.split('\n');
        const memInfo = {};

        lines.forEach(line => {
            const match = line.match(/^(\w+):\s+(\d+)/);
            if (match) memInfo[match[1]] = parseInt(match[2]) * 1024;
        });

        const total = memInfo.MemTotal || 0;
        const free = memInfo.MemFree || 0;
        const buffers = memInfo.Buffers || 0;
        const cached = memInfo.Cached || 0;
        const available = memInfo.MemAvailable || (free + buffers + cached);
        const used = total - available;

        return { total, used, free: available, usagePercent: Math.round((used / total) * 100 * 100) / 100 };
    } catch {
        const total = os.totalmem();
        const free = os.freemem();
        const used = total - free;
        return { total, used, free, usagePercent: Math.round((used / total) * 100 * 100) / 100 };
    }
}

function getSwapFromProc() {
    try {
        const memPath = `${HOST_PROC}/meminfo`;
        const content = fs.readFileSync(memPath, 'utf8');
        const memInfo = {};
        content.split('\n').forEach(line => {
            const match = line.match(/^(\w+):\s+(\d+)/);
            if (match) memInfo[match[1]] = parseInt(match[2]) * 1024;
        });
        const total = memInfo.SwapTotal || 0;
        const free = memInfo.SwapFree || 0;
        const used = Math.max(total - free, 0);
        return { total, used, free, usagePercent: total > 0 ? Math.round((used / total) * 100 * 100) / 100 : 0 };
    } catch {
        return { total: 0, used: 0, free: 0, usagePercent: 0 };
    }
}

function getProcessCount() {
    try {
        return fs.readdirSync(HOST_PROC).filter(name => /^\d+$/.test(name)).length;
    } catch {
        return 0;
    }
}

function runCommand(command, timeout = 3000) {
    return new Promise(resolve => {
        exec(command, { timeout }, (err, stdout) => resolve(err ? '' : stdout));
    });
}

async function getDockerInfo() {
    const stdout = await runCommand('docker ps -a --format "{{.State}} {{.Status}}" 2>/dev/null', 3000);
    if (!stdout.trim()) return { running: 0, total: 0, unhealthy: 0 };
    const lines = stdout.trim().split('\n').filter(Boolean);
    return {
        total: lines.length,
        running: lines.filter(line => line.startsWith('running')).length,
        unhealthy: lines.filter(line => /unhealthy/i.test(line)).length
    };
}

let networkCache = null;

function readNetworkTotals() {
    try {
        const content = fs.readFileSync(`${HOST_PROC}/net/dev`, 'utf8');
        let rxBytes = 0;
        let txBytes = 0;
        for (const line of content.split('\n').slice(2)) {
            const [ifacePart, statsPart] = line.split(':');
            const iface = String(ifacePart || '').trim();
            if (!iface || iface === 'lo') continue;
            const parts = String(statsPart || '').trim().split(/\s+/).map(Number);
            if (parts.length < 16) continue;
            rxBytes += parts[0] || 0;
            txBytes += parts[8] || 0;
        }
        return { rxBytes, txBytes };
    } catch {
        return { rxBytes: 0, txBytes: 0 };
    }
}

function getNetworkInfo() {
    const now = Date.now();
    const totals = readNetworkTotals();
    const prev = networkCache;
    networkCache = { ...totals, timestamp: now };
    if (!prev || now <= prev.timestamp) {
        return { ...totals, rxRate: 0, txRate: 0 };
    }
    const seconds = (now - prev.timestamp) / 1000;
    return {
        ...totals,
        rxRate: Math.max(0, Math.round(((totals.rxBytes - prev.rxBytes) / seconds) * 100) / 100),
        txRate: Math.max(0, Math.round(((totals.txBytes - prev.txBytes) / seconds) * 100) / 100)
    };
}

function getDiskInfoWindows() {
    return new Promise((resolve) => {
        // 使用 PowerShell 替代 wmic（更快）
        const cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3} | Select-Object Size,FreeSpace | ConvertTo-Json"';
        exec(cmd, { timeout: 5000 }, (err, stdout) => {
            if (err) {
                resolve({ total: 0, used: 0, free: 0 });
                return;
            }
            try {
                let disks = JSON.parse(stdout || '[]');
                if (!Array.isArray(disks)) disks = [disks];
                let total = 0, free = 0;
                disks.forEach(d => {
                    total += parseInt(d.Size) || 0;
                    free += parseInt(d.FreeSpace) || 0;
                });
                resolve({ total, used: total - free, free });
            } catch {
                resolve({ total: 0, used: 0, free: 0 });
            }
        });
    });
}

function getDiskInfoLinux() {
    return new Promise((resolve) => {
        const hostRoot = process.env.HOST_PROC ? '/host' : '/';
        exec(`df -B1 ${hostRoot} 2>/dev/null | tail -1 | awk '{print $2,$3,$4}'`, { timeout: 3000 }, (err, stdout) => {
            if (err) {
                resolve({ total: 0, used: 0, free: 0 });
                return;
            }
            const parts = stdout.trim().split(/\s+/);
            if (parts.length >= 3) {
                resolve({
                    total: parseInt(parts[0]) || 0,
                    used: parseInt(parts[1]) || 0,
                    free: parseInt(parts[2]) || 0
                });
            } else {
                resolve({ total: 0, used: 0, free: 0 });
            }
        });
    });
}

async function getDiskInfo() {
    // 检查缓存
    const now = Date.now();
    if (diskCache.data && (now - diskCache.timestamp) < DISK_CACHE_TTL) {
        return diskCache.data;
    }

    const diskInfo = process.platform === 'win32'
        ? await getDiskInfoWindows()
        : await getDiskInfoLinux();

    diskCache = { data: diskInfo, timestamp: now };
    return diskInfo;
}

async function collectLocalStats() {
    const cpuUsage = getCpuUsageFromProc();
    const cpuCores = os.cpus().length;
    const memory = getMemoryFromProc();
    const swap = getSwapFromProc();
    const network = getNetworkInfo();
    const docker = await getDockerInfo();
    const processInfo = { count: getProcessCount() };
    const diskInfo = await getDiskInfo();
    return {
        id: LOCAL_SERVER_ID,
        name: LOCAL_SERVER_NAME,
        region: LOCAL_SERVER_REGION,
        role: LOCAL_SERVER_ROLE,
        metrics: {
            cpu: { usage: cpuUsage, cores: cpuCores },
            memory,
            swap,
            disk: {
                total: diskInfo.total,
                used: diskInfo.used,
                free: diskInfo.free,
                usagePercent: diskInfo.total > 0 ? Math.round((diskInfo.used / diskInfo.total) * 100 * 100) / 100 : 0
            },
            uptime: os.uptime(),
            load: os.loadavg(),
            network,
            docker,
            process: processInfo
        }
    };
}

function requireAgentToken(req) {
    const auth = String(req.headers.authorization || '').trim();
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (AGENT_TOKENS.length === 0 || !AGENT_TOKENS.includes(token)) {
        throw new AppError('未授权：请提供有效的监控 Agent Token', 401);
    }
}

function normalizeRemoteReport(body) {
    const report = normalizeAgentReport({ ...(body || {}), lastSeen: Date.now() }, Date.now());
    if (!report.id || report.id === 'unknown') throw new AppError('缺少服务器 ID', 400);
    if (!/^[a-zA-Z0-9._:-]{1,43}$/.test(report.id)) throw new AppError('服务器 ID 格式不合法：1-43 位，仅支持字母、数字、点、下划线、冒号和短横线', 400);
    if (report.id === LOCAL_SERVER_ID) throw new AppError('远端 Agent 不能覆盖本机服务器 ID', 400);
    return report;
}

module.exports = function(db) {
    async function getServerConfigs() {
        const row = await db.queryOne('SELECT value FROM config WHERE `key` = ?', ['systemMonitorServers']);
        if (!row) {
            return [
                { id: LOCAL_SERVER_ID, name: LOCAL_SERVER_NAME, region: LOCAL_SERVER_REGION, role: LOCAL_SERVER_ROLE, enabled: true },
                { id: 'us-vps', name: 'US VPS', region: 'US', role: 'relay', enabled: true }
            ];
        }
        try {
            const parsed = JSON.parse(row.value);
            return Array.isArray(parsed) ? mergeServerConfigs([], parsed) : [];
        } catch {
            return [];
        }
    }

    async function saveServerConfigs(configs) {
        const current = await getServerConfigs();
        let next;
        try {
            next = mergeServerConfigs(current, configs).slice(0, 20);
        } catch (e) {
            throw new AppError(e.message || '服务器配置无效', 400);
        }
        const value = JSON.stringify(next);
        if (db.USE_MYSQL || db.getDatabaseType?.() === 'mysql') {
            await db.execute(
                'INSERT INTO config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
                ['systemMonitorServers', value]
            );
        } else {
            await db.execute(
                'INSERT INTO config (`key`, value) VALUES (?, ?) ON CONFLICT(`key`) DO UPDATE SET value = excluded.value',
                ['systemMonitorServers', value]
            );
        }
        return next;
    }

    // GET /api/system/stats - 兼容旧组件：返回本机指标
    router.get('/stats', asyncHandler(async (req, res) => {
        const local = normalizeAgentReport(await collectLocalStats(), Date.now());
        res.json(success({
            cpu: local.cpu,
            memory: local.memory,
            disk: local.disk,
            swap: local.swap,
            network: local.network,
            docker: local.docker,
            process: local.process,
            uptime: local.uptime,
            load: local.load
        }));
    }));

    // GET /api/system/servers - 哪吒式多服务器列表
    router.get('/servers', asyncHandler(async (req, res) => {
        const now = Date.now();
        const local = normalizeAgentReport(await collectLocalStats(), now);
        const agents = [...agentReports.values()];
        const configs = await getServerConfigs();
        res.json(success({
            servers: buildServerList({ local, agents, configs, now }),
            config: configs,
            updatedAt: new Date(now).toISOString()
        }));
    }));

    // GET /api/system/config - 页面配置服务器列表
    router.get('/config', asyncHandler(async (req, res) => {
        res.json(success({ servers: await getServerConfigs() }));
    }));

    // POST /api/system/config - 保存页面服务器配置
    router.post('/config', requireStrictAdmin, asyncHandler(async (req, res) => {
        const servers = Array.isArray(req.body?.servers) ? req.body.servers : [];
        res.json(success({ servers: await saveServerConfigs(servers) }));
    }));

    // POST /api/system/report - 远端 agent 上报心跳/指标
    router.post('/report', asyncHandler(async (req, res) => {
        requireAgentToken(req);
        const report = normalizeRemoteReport(req.body || {});
        agentReports.set(report.id, report);
        res.json(success({ id: report.id, status: report.status }));
    }));

    return router;
};
