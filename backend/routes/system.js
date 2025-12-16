/**
 * 系统状态路由模块
 */
const express = require('express');
const os = require('os');
const fs = require('fs');
const router = express.Router();
const { success, asyncHandler } = require('../utils');

const HOST_PROC = process.env.HOST_PROC || '/proc';
let lastCpuTimes = null;

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

module.exports = function(_db) {
    // GET /api/system/stats
    router.get('/stats', asyncHandler(async (req, res) => {
        const cpuUsage = getCpuUsageFromProc();
        const cpuCores = os.cpus().length;
        const memory = getMemoryFromProc();

        let diskInfo = { total: 0, used: 0, free: 0 };
        try {
            const { execSync } = require('child_process');
            if (process.platform === 'win32') {
                const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
                const lines = output.trim().split('\n').slice(1);
                lines.forEach(line => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 3) {
                        diskInfo.free += parseInt(parts[1]) || 0;
                        diskInfo.total += parseInt(parts[2]) || 0;
                    }
                });
                diskInfo.used = diskInfo.total - diskInfo.free;
            } else {
                const hostRoot = process.env.HOST_PROC ? '/host' : '/';
                const output = execSync(`df -B1 ${hostRoot} 2>/dev/null || df -B1 / | tail -1 | awk '{print $2,$3,$4}'`, { encoding: 'utf8' });
                const lastLine = output.trim().split('\n').pop();
                const parts = lastLine.split(/\s+/);
                if (parts.length >= 4) {
                    diskInfo.total = parseInt(parts[1]) || 0;
                    diskInfo.used = parseInt(parts[2]) || 0;
                    diskInfo.free = parseInt(parts[3]) || 0;
                }
            }
        } catch (e) {
            console.error('获取磁盘信息失败:', e.message);
        }

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
