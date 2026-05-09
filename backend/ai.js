/**
 * AI 相关 API（可选功能）
 *
 * 统一入口：/api/ai?action=...
 * - GET  /api/ai?action=status
 * - GET  /api/ai?action=bookmark&id=...
 * - POST /api/ai?action=bookmark   （保存标签/摘要）
 * - POST /api/ai?action=generate   （AI 生成标签/摘要，可选持久化）
 */

const aiService = require('../shared/services/ai');

const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AI_RATE_LIMIT_MAX = 10;
const AI_GENERATE_BODY_MAX_CHARS = 12000;
const aiRateLimitBuckets = new Map();

function getClientIp(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function enforceAiRateLimit(req) {
    const now = Date.now();
    const ip = getClientIp(req);
    const bucket = aiRateLimitBuckets.get(ip) || { count: 0, resetAt: now + AI_RATE_LIMIT_WINDOW_MS };
    if (bucket.resetAt <= now) {
        bucket.count = 0;
        bucket.resetAt = now + AI_RATE_LIMIT_WINDOW_MS;
    }
    bucket.count += 1;
    aiRateLimitBuckets.set(ip, bucket);

    if (aiRateLimitBuckets.size > 1000) {
        for (const [key, value] of aiRateLimitBuckets.entries()) {
            if (value.resetAt <= now) aiRateLimitBuckets.delete(key);
        }
    }

    if (bucket.count > AI_RATE_LIMIT_MAX) {
        const err = new Error('AI 请求过于频繁，请稍后再试');
        err.statusCode = 429;
        err.retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
        throw err;
    }
}

function enforceAiRequestSize(body) {
    const totalChars = JSON.stringify(body || {}).length;
    if (totalChars > AI_GENERATE_BODY_MAX_CHARS) {
        const err = new Error('AI 请求内容过长');
        err.statusCode = 413;
        throw err;
    }
}


function registerAiRoutes(app, db) {
    app.all('/api/ai', async (req, res) => {
        const action = String(req.query.action || '').toLowerCase();

        try {
            if (req.method === 'GET' && action === 'status') {
                return res.json({ success: true, data: aiService.getAiPublicStatus() });
            }

            if (req.method === 'GET' && action === 'bookmark') {
                const id = String(req.query.id || '').trim();
                if (!id) return res.status(400).json({ success: false, error: '缺少书签 ID' });
                const data = await aiService.getBookmarkAi(db, id);
                return res.json({ success: true, data });
            }

            if (req.method === 'POST' && action === 'bookmark') {
                const { bookmarkId, tags, summary } = req.body || {};
                const id = String(bookmarkId || '').trim();
                if (!id) return res.status(400).json({ success: false, error: '缺少书签 ID' });
                await aiService.saveBookmarkAi(db, { bookmarkId: id, tags, summary });
                return res.json({ success: true });
            }

            if (req.method === 'POST' && action === 'generate') {
                enforceAiRateLimit(req);
                enforceAiRequestSize(req.body);
                const data = await aiService.generateAi(db, req.body);
                return res.json({ success: true, data });
            }

            return res.status(404).json({ success: false, error: '未知操作' });
        } catch (e) {
            const statusCode = Number.isInteger(e?.statusCode) ? e.statusCode : 500;
            if (statusCode === 429 && e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
            return res.status(statusCode).json({ success: false, error: e.message });
        }
    });
}

module.exports = { registerAiRoutes };
