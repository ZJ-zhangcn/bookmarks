const crypto = require('crypto');
const express = require('express');

const { success, asyncHandler, AppError } = require('../utils');
const { requireStrictAdmin } = require('../middleware/security');
const { fetchWithTimeout, extractTextFromOpenAiLikeResponse } = require('../../shared/services/ai/http');

const jobs = new Map();

const MAX_JOBS = 80;
const MAX_AUDIT_MESSAGE = 2000;
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MODEL = 'hermes-agent';

const ACTIONS = {
    service_diagnose: {
        id: 'service_diagnose',
        label: '服务诊断',
        risk: 'low',
        requiresConfirmation: false,
        description: '根据书签服务卡片、监控指标和用户补充信息分析服务异常。'
    },
    bookmark_organize: {
        id: 'bookmark_organize',
        label: '书签整理建议',
        risk: 'low',
        requiresConfirmation: false,
        description: '分析当前书签，给出分类、标签、坏链和重复项整理建议。'
    },
    monitor_explain: {
        id: 'monitor_explain',
        label: '监控异常解释',
        risk: 'low',
        requiresConfirmation: false,
        description: '解释 CPU、内存、磁盘、Docker、在线状态等监控异常并给出排查顺序。'
    },
    command_panel: {
        id: 'command_panel',
        label: '控制台提问',
        risk: 'medium',
        requiresConfirmation: true,
        description: '把自然语言请求发送给 Hermes。适合分析、规划、生成命令；默认不直接执行危险写操作。'
    }
};

function getConfig() {
    const apiBaseUrl = String(process.env.HERMES_API_BASE_URL || '').trim().replace(/\/+$/, '');
    const apiKey = String(process.env.HERMES_API_KEY || process.env.HERMES_API_SERVER_KEY || '').trim();
    const webhookUrl = String(process.env.HERMES_WEBHOOK_URL || '').trim();
    const webhookSecret = String(process.env.HERMES_WEBHOOK_SECRET || '').trim();
    const model = String(process.env.HERMES_MODEL || process.env.HERMES_API_MODEL || DEFAULT_MODEL).trim();
    const timeoutMs = parseInt(process.env.HERMES_TIMEOUT_MS || '', 10);
    return {
        apiBaseUrl,
        apiKey,
        webhookUrl,
        webhookSecret,
        model,
        timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
        configured: Boolean((apiBaseUrl && apiKey) || webhookUrl)
    };
}

function sanitizeInput(value, depth = 0) {
    if (depth > 4) return '[MaxDepth]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.slice(0, 4000);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 50).map(item => sanitizeInput(item, depth + 1));
    if (typeof value === 'object') {
        const output = {};
        for (const [key, raw] of Object.entries(value).slice(0, 80)) {
            if (/token|secret|password|api[_-]?key|authorization/i.test(key)) {
                output[key] = '[REDACTED]';
            } else {
                output[key] = sanitizeInput(raw, depth + 1);
            }
        }
        return output;
    }
    return String(value).slice(0, 1000);
}

function publicJob(job) {
    return {
        id: job.id,
        action: job.action,
        risk: job.risk,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        finishedAt: job.finishedAt || null,
        error: job.error || null,
        result: job.result || null
    };
}

function pruneJobs() {
    const entries = [...jobs.entries()].sort((a, b) => String(a[1].createdAt).localeCompare(String(b[1].createdAt)));
    while (entries.length > MAX_JOBS) {
        const [id] = entries.shift();
        jobs.delete(id);
    }
}

async function writeAudit(db, job, status, message = '') {
    const safeMessage = String(message || '').slice(0, MAX_AUDIT_MESSAGE);
    const id = `ha_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    const sql = 'INSERT INTO hermes_audit (id, job_id, action, risk, status, message) VALUES (?, ?, ?, ?, ?, ?)';
    try {
        await db.execute(sql, [id, job.id, job.action, job.risk, status, safeMessage]);
    } catch (e) {
        // 审计表可能尚未迁移；不要因为审计写失败阻断主流程。
        console.warn('[Hermes] audit write failed:', e.message);
    }
}

function buildPrompt(action, input = {}) {
    const context = sanitizeInput(input || {});
    const contextJson = JSON.stringify(context, null, 2);
    const common = [
        '你是 Jin 的 Hermes 个人控制台助手，正在由 bookmarks.942645.xyz 后端安全代理调用。',
        '请直接给出可执行、可验证、简洁的中文结论。',
        '如果涉及危险写操作、删除、重启、发布、发送消息，只能给建议和确认清单，不要声称已经执行。',
        '不要输出或猜测任何 token、密码、API key、Authorization header。'
    ].join('\n');

    if (action === 'service_diagnose') {
        return `${common}\n\n任务：诊断一个书签/服务卡片可能的问题。请输出：状态判断、最可能原因、建议检查顺序、安全修复建议。\n\n上下文：\n${contextJson}`;
    }
    if (action === 'bookmark_organize') {
        return `${common}\n\n任务：整理书签。请输出：推荐分类/标签、疑似重复、疑似坏链、可以自动化处理但需要确认的改动清单。\n\n上下文：\n${contextJson}`;
    }
    if (action === 'monitor_explain') {
        return `${common}\n\n任务：解释监控异常。请结合资源指标输出异常级别、可能原因、排查顺序、是否需要立即处理。\n\n上下文：\n${contextJson}`;
    }
    if (action === 'command_panel') {
        return `${common}\n\n任务：回答控制台自然语言请求。若请求不明确，先列出安全假设；若需要真实执行外部副作用，请要求二次确认。\n\n上下文：\n${contextJson}`;
    }
    throw new AppError(`不支持的 Hermes 动作：${action}`, 400);
}

function signWebhookBody(body, secret) {
    if (!secret) return null;
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function getChatCompletionsUrl(apiBaseUrl) {
    const base = String(apiBaseUrl || '').replace(/\/+$/, '');
    return `${base.endsWith('/v1') ? base : `${base}/v1`}/chat/completions`;
}

async function callHermesApi(config, job) {
    const url = getChatCompletionsUrl(config.apiBaseUrl);
    const payload = {
        model: config.model,
        stream: false,
        messages: [{ role: 'user', content: job.prompt }]
    };
    const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
            'X-Hermes-Session-Id': `bookmarks:${job.action}`,
            'X-Hermes-Session-Key': 'bookmarks-console'
        },
        body: JSON.stringify(payload)
    }, config.timeoutMs);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
        const message = data?.error?.message || data?.error || text || `Hermes API HTTP ${res.status}`;
        throw new Error(String(message).slice(0, 500));
    }
    return extractTextFromOpenAiLikeResponse(data) || text || 'Hermes 已返回空响应。';
}

async function callHermesWebhook(config, job) {
    const payload = {
        event_type: 'bookmarks_console',
        job_id: job.id,
        action: job.action,
        prompt: job.prompt,
        input: job.input
    };
    const raw = JSON.stringify(payload);
    const headers = {
        'Content-Type': 'application/json',
        'X-Request-ID': job.id
    };
    const signature = signWebhookBody(raw, config.webhookSecret);
    if (signature) headers['X-Webhook-Signature'] = signature;
    const res = await fetchWithTimeout(config.webhookUrl, { method: 'POST', headers, body: raw }, config.timeoutMs);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
        const message = data?.error || text || `Hermes Webhook HTTP ${res.status}`;
        throw new Error(String(message).slice(0, 500));
    }
    return data?.delivery_id
        ? `Hermes webhook 已接受任务，delivery_id=${data.delivery_id}`
        : (data?.status ? `Hermes webhook 状态：${data.status}` : 'Hermes webhook 已接受任务。');
}

async function runJob(db, job, config) {
    job.status = 'running';
    job.updatedAt = new Date().toISOString();
    await writeAudit(db, job, 'running');
    try {
        const text = config.apiBaseUrl && config.apiKey
            ? await callHermesApi(config, job)
            : await callHermesWebhook(config, job);
        job.status = 'succeeded';
        job.result = { text: String(text || '').slice(0, 12000) };
        job.finishedAt = new Date().toISOString();
        job.updatedAt = job.finishedAt;
        await writeAudit(db, job, 'succeeded', job.result.text);
    } catch (e) {
        job.status = 'failed';
        job.error = e.message || 'Hermes 调用失败';
        job.finishedAt = new Date().toISOString();
        job.updatedAt = job.finishedAt;
        await writeAudit(db, job, 'failed', job.error);
    }
}

module.exports = function(db) {
    const router = express.Router();

    router.get('/status', asyncHandler(async (req, res) => {
        const config = getConfig();
        res.json(success({
            configured: config.configured,
            transport: config.apiBaseUrl && config.apiKey ? 'api_server' : (config.webhookUrl ? 'webhook' : null),
            model: config.model,
            actions: Object.values(ACTIONS)
        }));
    }));

    router.get('/audit', requireStrictAdmin, asyncHandler(async (req, res) => {
        const rows = await db.queryAll('SELECT id, job_id, action, risk, status, message, created_at FROM hermes_audit ORDER BY created_at DESC LIMIT 50');
        res.json(success(rows));
    }));

    router.post('/jobs', requireStrictAdmin, asyncHandler(async (req, res) => {
        const action = String(req.body?.action || '').trim();
        const actionConfig = ACTIONS[action];
        if (!actionConfig) throw new AppError(`不支持的 Hermes 动作：${action}`, 400);
        if (actionConfig.requiresConfirmation && req.body?.confirm !== true) {
            throw new AppError('该 Hermes 动作需要二次确认 confirm=true', 409);
        }
        const config = getConfig();
        if (!config.configured) throw new AppError('未配置 Hermes API/Webhook。请在服务端设置 HERMES_API_BASE_URL + HERMES_API_KEY，或 HERMES_WEBHOOK_URL。', 503);

        const now = new Date().toISOString();
        const job = {
            id: `hj_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
            action,
            risk: actionConfig.risk,
            status: 'queued',
            input: sanitizeInput(req.body?.input || {}),
            createdAt: now,
            updatedAt: now
        };
        job.prompt = buildPrompt(action, job.input);
        jobs.set(job.id, job);
        pruneJobs();
        await writeAudit(db, job, 'created', JSON.stringify(job.input).slice(0, MAX_AUDIT_MESSAGE));
        setImmediate(() => runJob(db, job, config));
        res.status(202).json(success(publicJob(job)));
    }));

    router.get('/jobs/:id', requireStrictAdmin, asyncHandler(async (req, res) => {
        const job = jobs.get(String(req.params.id || ''));
        if (!job) throw new AppError('Hermes 任务不存在或已过期', 404);
        res.json(success(publicJob(job)));
    }));

    return router;
};

module.exports.ACTIONS = ACTIONS;
module.exports._private = { buildPrompt, sanitizeInput, getConfig, getChatCompletionsUrl };
