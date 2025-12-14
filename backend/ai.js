/**
 * AI 相关 API（可选功能）
 *
 * 统一入口：/api/ai?action=...
 * - GET  /api/ai?action=status
 * - GET  /api/ai?action=bookmark&id=...
 * - POST /api/ai?action=bookmark   （保存标签/摘要）
 * - POST /api/ai?action=generate   （AI 生成标签/摘要，可选持久化）
 *
 * 说明：
 * - 默认关闭：需显式设置 AI_ENABLED=true 且配置对应 Provider 的密钥
 * - 为了不影响现有功能：不改动既有 API 行为，仅新增接口与新表 bookmark_ai
 */

function isAiEnabledFlag() {
    return String(process.env.AI_ENABLED).toLowerCase() === 'true';
}

function getAiProvider() {
    return String(process.env.AI_PROVIDER || 'openai').toLowerCase();
}

function getDefaultModelForProvider(provider) {
    if (provider === 'openai') {
        const specific = String(process.env.OPENAI_MODEL || '').trim();
        if (specific) return specific;
    }
    if (provider === 'gemini') {
        const specific = String(process.env.GEMINI_MODEL || '').trim();
        if (specific) return specific;
    }
    if (provider === 'claude') {
        const specific = String(process.env.ANTHROPIC_MODEL || '').trim();
        if (specific) return specific;
    }

    const globalModel = String(process.env.AI_MODEL || '').trim();
    if (globalModel) return globalModel;

    if (provider === 'openai') return 'gpt-4o-mini';
    if (provider === 'gemini') return 'gemini-1.5-flash';
    if (provider === 'claude') return 'claude-3-5-sonnet-latest';
    return 'gpt-4o-mini';
}

function getDefaultBaseUrlForProvider(provider) {
    const globalBase = String(process.env.AI_BASE_URL || '').trim();
    if (globalBase) return globalBase;

    if (provider === 'openai') return 'https://api.openai.com/v1';
    if (provider === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta';
    if (provider === 'claude') return 'https://api.anthropic.com/v1';
    return 'https://api.openai.com/v1';
}

function allowClientKey() {
    return String(process.env.AI_ALLOW_CLIENT_KEY).toLowerCase() === 'true';
}

function allowClientBaseUrl() {
    return String(process.env.AI_ALLOW_CLIENT_BASE_URL).toLowerCase() === 'true';
}

function allowClientProvider() {
    return String(process.env.AI_ALLOW_CLIENT_PROVIDER).toLowerCase() === 'true';
}

function allowPrivateBaseUrl() {
    return String(process.env.AI_ALLOW_PRIVATE_BASE_URL).toLowerCase() === 'true';
}

function hasServerKey() {
    const provider = getAiProvider();
    if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
    if (provider === 'gemini') return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    if (provider === 'claude') return Boolean(process.env.ANTHROPIC_API_KEY);
    return false;
}

function getAiPublicStatus() {
    const provider = getAiProvider();
    const model = getDefaultModelForProvider(provider);
    const baseUrl = getDefaultBaseUrlForProvider(provider);
    return {
        enabled: isAiEnabledFlag(),
        provider,
        model: model || null,
        baseUrl,
        allowClientKey: allowClientKey(),
        allowClientBaseUrl: allowClientBaseUrl(),
        allowClientProvider: allowClientProvider(),
        allowPrivateBaseUrl: allowPrivateBaseUrl(),
        hasServerKey: hasServerKey(),
        supportedProviders: ['openai', 'gemini', 'claude'],
        note: '自用场景：建议在 Docker 主站开启，Vercel 备用站默认关闭以规避免费额度/超时限制'
    };
}

function normalizeTagsInput(input) {
    if (Array.isArray(input)) {
        return input
            .map(t => String(t || '').trim())
            .filter(Boolean)
            .slice(0, 20);
    }
    const text = String(input || '');
    return text
        .split(/[,\n，;；|/]+/g)
        .map(t => t.trim())
        .filter(Boolean)
        .slice(0, 20);
}

function safeJsonParse(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {}
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
        try {
            return JSON.parse(text.slice(first, last + 1));
        } catch {}
    }
    return null;
}

function isPrivateOrLocalAddress(hostname) {
    if (!hostname) return true;
    const lower = String(hostname).toLowerCase();
    if (lower === 'localhost' || lower === '127.0.0.1' || lower === '0.0.0.0') return true;
    const privatePatterns = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^fc00:/i,
        /^fe80:/i
    ];
    return privatePatterns.some(p => p.test(lower));
}

function normalizeBaseUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;

    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error('AI API 地址不是合法 URL');
    }

    if (parsed.username || parsed.password) {
        throw new Error('AI API 地址不允许包含用户名/密码');
    }

    const isPrivate = isPrivateOrLocalAddress(parsed.hostname);
    if (isPrivate && !allowPrivateBaseUrl()) {
        throw new Error('AI API 地址为内网/本地地址，当前未允许（可设置 AI_ALLOW_PRIVATE_BASE_URL=true 放开）');
    }

    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isPrivate && allowPrivateBaseUrl())) {
        throw new Error('AI API 地址仅允许 https（内网/本地可选允许 http）');
    }

    return parsed.toString().replace(/\/+$/, '');
}

function resolveOpenAiRuntimeConfig(body) {
    const requestBody = body || {};

    const provider = 'openai';
    const cfg = {
        baseUrl: getDefaultBaseUrlForProvider(provider).replace(/\/+$/, ''),
        apiKey: process.env.OPENAI_API_KEY || '',
        model: getDefaultModelForProvider(provider),
        timeoutMs: Number.parseInt(process.env.AI_TIMEOUT_MS || '8000', 10)
    };

    const modelOverride = String(requestBody.model || '').trim();
    if (modelOverride) cfg.model = modelOverride;

    const baseUrlOverride = String(requestBody.apiBaseUrl || '').trim();
    if (baseUrlOverride) {
        if (!allowClientBaseUrl()) {
            throw new Error('服务器未允许从前端覆盖 AI API 地址（可设置 AI_ALLOW_CLIENT_BASE_URL=true 放开）');
        }
        cfg.baseUrl = normalizeBaseUrl(baseUrlOverride);
    }

    const keyOverride = String(requestBody.apiKey || '').trim();
    if (keyOverride) {
        if (!allowClientKey()) {
            throw new Error('服务器未允许从前端传入 AI Key（可设置 AI_ALLOW_CLIENT_KEY=true 放开）');
        }
        cfg.apiKey = keyOverride;
    }

    if (!cfg.apiKey) {
        if (allowClientKey()) {
            throw new Error('缺少 AI Key：请在“AI 设置”里填写，或在服务器环境变量中配置 OPENAI_API_KEY');
        }
        throw new Error('缺少 AI Key：请在服务器环境变量中配置 OPENAI_API_KEY');
    }

    return cfg;
}

function resolveProvider(body) {
    const requestBody = body || {};
    const providerOverride = String(requestBody.provider || '').trim().toLowerCase();
    if (!providerOverride) return getAiProvider();
    if (!allowClientProvider()) {
        throw new Error('服务器未允许从前端覆盖 AI Provider（可设置 AI_ALLOW_CLIENT_PROVIDER=true 放开）');
    }
    if (!['openai', 'gemini', 'claude'].includes(providerOverride)) {
        throw new Error(`不支持的 provider: ${providerOverride}`);
    }
    return providerOverride;
}

function getServerApiKeyForProvider(provider) {
    if (provider === 'openai') return process.env.OPENAI_API_KEY || '';
    if (provider === 'gemini') return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    if (provider === 'claude') return process.env.ANTHROPIC_API_KEY || '';
    return '';
}

function fetchWithTimeout(url, options, timeoutMs) {
    const ms = Number.isFinite(timeoutMs) ? timeoutMs : 8000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...(options || {}), signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

function createHttpError(statusCode, message) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

function resolveRuntimeConfig(body) {
    const provider = resolveProvider(body);
    if (provider === 'openai') {
        return { provider, ...resolveOpenAiRuntimeConfig(body) };
    }

    const requestBody = body || {};
    const cfg = {
        provider,
        baseUrl: getDefaultBaseUrlForProvider(provider).replace(/\/+$/, ''),
        apiKey: getServerApiKeyForProvider(provider),
        model: getDefaultModelForProvider(provider),
        timeoutMs: Number.parseInt(process.env.AI_TIMEOUT_MS || '8000', 10)
    };

    const modelOverride = String(requestBody.model || '').trim();
    if (modelOverride) cfg.model = modelOverride;

    const baseUrlOverride = String(requestBody.apiBaseUrl || '').trim();
    if (baseUrlOverride) {
        if (!allowClientBaseUrl()) {
            throw new Error('服务器未允许从前端覆盖 AI API 地址（可设置 AI_ALLOW_CLIENT_BASE_URL=true 放开）');
        }
        cfg.baseUrl = normalizeBaseUrl(baseUrlOverride);
    }

    const keyOverride = String(requestBody.apiKey || '').trim();
    if (keyOverride) {
        if (!allowClientKey()) {
            throw new Error('服务器未允许从前端传入 AI Key（可设置 AI_ALLOW_CLIENT_KEY=true 放开）');
        }
        cfg.apiKey = keyOverride;
    }

    if (!cfg.apiKey) {
        if (allowClientKey()) {
            throw new Error('缺少 AI Key：请在“AI 设置”里填写，或在服务器环境变量中配置对应 Provider 的 Key');
        }
        throw new Error('缺少 AI Key：请在服务器环境变量中配置对应 Provider 的 Key');
    }

    return cfg;
}

async function openaiGenerateWithConfig({ name, url, description, baseUrl, apiKey, model, timeoutMs }) {
    const userPayload = {
        name: String(name || '').slice(0, 200),
        url: String(url || '').slice(0, 2000),
        description: String(description || '').slice(0, 500)
    };

    const prompt = [
        '你是一个书签整理助手。请基于输入生成：',
        '1) tags：3~8 个中文标签（每个标签 2~8 个字，避免重复）',
        '2) summary：一句话中文摘要（<= 40 字）',
        '只输出 JSON（不要代码块，不要多余文字），格式：{"tags":["..."],"summary":"..."}',
        '',
        JSON.stringify(userPayload)
    ].join('\n');

    const endpoint = `${String(baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
    const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: '你严格按要求输出 JSON。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 220
        })
    }, timeoutMs);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = data?.error?.message || '';
        const message = `OpenAI 网关错误（HTTP ${response.status}）${detail ? `：${detail}` : ''}`;
        throw createHttpError(502, message);
    }

    const text = data?.choices?.[0]?.message?.content || '';
    const parsed = safeJsonParse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('AI 返回内容无法解析为 JSON');

    return {
        tags: normalizeTagsInput(parsed.tags),
        summary: String(parsed.summary || '').trim().slice(0, 80),
        provider: 'openai',
        model
    };
}

async function geminiGenerateWithConfig({ name, url, description, baseUrl, apiKey, model, timeoutMs }) {
    const userPayload = {
        name: String(name || '').slice(0, 200),
        url: String(url || '').slice(0, 2000),
        description: String(description || '').slice(0, 500)
    };

    const prompt = [
        '你是一个书签整理助手。请基于输入生成：',
        '1) tags：3~8 个中文标签（每个标签 2~8 个字，避免重复）',
        '2) summary：一句话中文摘要（<= 40 字）',
        '只输出 JSON（不要代码块，不要多余文字），格式：{"tags":["..."],"summary":"..."}',
        '',
        JSON.stringify(userPayload)
    ].join('\n');

    const base = String(baseUrl || '').replace(/\/+$/, '');
    const endpoint = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 220 }
        })
    }, timeoutMs);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = data?.error?.message || '';
        const message = `Gemini 网关错误（HTTP ${response.status}）${detail ? `：${detail}` : ''}`;
        throw createHttpError(502, message);
    }

    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
    const parsed = safeJsonParse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('AI 返回内容无法解析为 JSON');

    return {
        tags: normalizeTagsInput(parsed.tags),
        summary: String(parsed.summary || '').trim().slice(0, 80),
        provider: 'gemini',
        model
    };
}

async function claudeGenerateWithConfig({ name, url, description, baseUrl, apiKey, model, timeoutMs }) {
    const userPayload = {
        name: String(name || '').slice(0, 200),
        url: String(url || '').slice(0, 2000),
        description: String(description || '').slice(0, 500)
    };

    const prompt = [
        '你是一个书签整理助手。请基于输入生成：',
        '1) tags：3~8 个中文标签（每个标签 2~8 个字，避免重复）',
        '2) summary：一句话中文摘要（<= 40 字）',
        '只输出 JSON（不要代码块，不要多余文字），格式：{"tags":["..."],"summary":"..."}',
        '',
        JSON.stringify(userPayload)
    ].join('\n');

    const endpoint = `${String(baseUrl || '').replace(/\/+$/, '')}/messages`;
    const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01'
        },
        body: JSON.stringify({
            model,
            max_tokens: 220,
            temperature: 0.2,
            messages: [{ role: 'user', content: prompt }]
        })
    }, timeoutMs);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = data?.error?.message || '';
        const message = `Claude 网关错误（HTTP ${response.status}）${detail ? `：${detail}` : ''}`;
        throw createHttpError(502, message);
    }

    const text = Array.isArray(data?.content)
        ? data.content.map(c => (c && c.type === 'text' ? c.text : '')).filter(Boolean).join('')
        : (data?.content?.text || '');
    const parsed = safeJsonParse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('AI 返回内容无法解析为 JSON');

    return {
        tags: normalizeTagsInput(parsed.tags),
        summary: String(parsed.summary || '').trim().slice(0, 80),
        provider: 'claude',
        model
    };
}

async function ensureAiTables(db) {
    const createSql = db.USE_MYSQL
        ? `
            CREATE TABLE IF NOT EXISTS bookmark_ai (
                bookmark_id VARCHAR(50) PRIMARY KEY,
                tags LONGTEXT,
                summary TEXT,
                provider VARCHAR(50),
                model VARCHAR(100),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
        : `
            CREATE TABLE IF NOT EXISTS bookmark_ai (
                bookmark_id TEXT PRIMARY KEY,
                tags TEXT,
                summary TEXT,
                provider TEXT,
                model TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `;
    try {
        await db.execute(createSql);
    } catch (e) {
        // 不影响主功能：AI 表创建失败时，仅让 AI 功能不可用
        throw new Error('AI 数据表初始化失败：' + e.message);
    }
}

async function upsertBookmarkAi(db, { bookmarkId, tags, summary, provider, model }) {
    const tagsJson = JSON.stringify(tags || []);
    const sum = summary ? String(summary) : '';

    if (db.USE_MYSQL) {
        await db.execute(
            `INSERT INTO bookmark_ai (bookmark_id, tags, summary, provider, model)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE tags = VALUES(tags), summary = VALUES(summary), provider = VALUES(provider), model = VALUES(model)`,
            [bookmarkId, tagsJson, sum, provider || '', model || '']
        );
    } else {
        await db.execute(
            `INSERT OR REPLACE INTO bookmark_ai (bookmark_id, tags, summary, provider, model, updated_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [bookmarkId, tagsJson, sum, provider || '', model || '']
        );
    }
}

function registerAiRoutes(app, db) {
    app.all('/api/ai', async (req, res) => {
        const action = String(req.query.action || '').toLowerCase();

        try {
            if (req.method === 'GET' && action === 'status') {
                return res.json({ success: true, data: getAiPublicStatus() });
            }

            if (req.method === 'GET' && action === 'bookmark') {
                const id = String(req.query.id || '').trim();
                if (!id) return res.status(400).json({ success: false, error: '缺少书签 ID' });

                await ensureAiTables(db);
                const row = await db.queryOne('SELECT * FROM bookmark_ai WHERE bookmark_id = ?', [id]);
                if (!row) return res.json({ success: true, data: null });

                let tags = [];
                try { tags = JSON.parse(row.tags || '[]'); } catch {}
                return res.json({
                    success: true,
                    data: {
                        bookmark_id: row.bookmark_id,
                        tags: Array.isArray(tags) ? tags : [],
                        summary: row.summary || '',
                        provider: row.provider || null,
                        model: row.model || null,
                        updated_at: row.updated_at || null
                    }
                });
            }

            if (req.method === 'POST' && action === 'bookmark') {
                const { bookmarkId, tags, summary } = req.body || {};
                const id = String(bookmarkId || '').trim();
                if (!id) return res.status(400).json({ success: false, error: '缺少书签 ID' });

                await ensureAiTables(db);
                await upsertBookmarkAi(db, {
                    bookmarkId: id,
                    tags: normalizeTagsInput(tags),
                    summary: summary ? String(summary).trim().slice(0, 200) : '',
                    provider: 'manual',
                    model: null
                });
                return res.json({ success: true });
            }

            if (req.method === 'POST' && action === 'generate') {
                if (!isAiEnabledFlag()) {
                    return res.status(400).json({ success: false, error: 'AI 功能未启用（请设置 AI_ENABLED=true）' });
                }

                const { bookmarkId, name, url, description, persist } = req.body || {};
                const shouldPersist = String(persist).toLowerCase() === 'true';
                const id = String(bookmarkId || '').trim();

                const cfg = resolveRuntimeConfig(req.body);
                let result;
                if (cfg.provider === 'openai') result = await openaiGenerateWithConfig({ name, url, description, ...cfg });
                else if (cfg.provider === 'gemini') result = await geminiGenerateWithConfig({ name, url, description, ...cfg });
                else if (cfg.provider === 'claude') result = await claudeGenerateWithConfig({ name, url, description, ...cfg });
                else return res.status(400).json({ success: false, error: `不支持的 AI_PROVIDER: ${cfg.provider}` });

                if (shouldPersist) {
                    if (!id) return res.status(400).json({ success: false, error: '持久化需要提供 bookmarkId' });
                    await ensureAiTables(db);
                    await upsertBookmarkAi(db, { bookmarkId: id, ...result });
                }

                return res.json({ success: true, data: { tags: result.tags, summary: result.summary } });
            }

            return res.status(404).json({ success: false, error: '未知操作' });
        } catch (e) {
            const statusCode = Number.isInteger(e?.statusCode) ? e.statusCode : 500;
            return res.status(statusCode).json({ success: false, error: e.message });
        }
    });
}

module.exports = { registerAiRoutes };
