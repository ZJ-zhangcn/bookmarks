/**
 * 系统状态路由模块
 */
const express = require('express');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const router = express.Router();
const { success, asyncHandler } = require('../utils');

const HOST_PROC = process.env.HOST_PROC || '/proc';
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
            for (let type in cpu.times) totalTick += cpu.times[type];
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

module.exports = function(_db) {
    // GET /api/system/stats
    router.get('/stats', asyncHandler(async (req, res) => {
        const cpuUsage = getCpuUsageFromProc();
        const cpuCores = os.cpus().length;
        const memory = getMemoryFromProc();
        const diskInfo = await getDiskInfo();

        res.json(success({
            cpu: { usage: cpuUsage, cores: cpuCores },
            memory: memory,
            disk: {
                total: diskInfo.total,
                used: diskInfo.used,
                free: diskInfo.free,
                usagePercent: diskInfo.total > 0 ? Math.round((diskInfo.used / diskInfo.total) * 100 * 100) / 100 : 0
            }
        }));
    }));

    return router;
};
