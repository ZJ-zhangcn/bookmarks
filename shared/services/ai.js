/**
 * AI 服务 - 共享业务逻辑
 *
 * 统一入口，供 Express 和 Vercel 使用
 * - getAiPublicStatus() - 获取 AI 状态
 * - getBookmarkAi(db, id) - 获取书签 AI 数据
 * - saveBookmarkAi(db, { bookmarkId, tags, summary }) - 保存书签 AI 数据
 * - generateAi(db, body) - AI 生成标签/摘要
 */

// ========================================
// 配置相关
// ========================================

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
        supportedProviders: ['openai', 'gemini', 'claude']
    };
}

// ========================================
// Prompt 构建
// ========================================

const DEFAULT_AI_SYSTEM_PROMPT = [
    '你是一个书签整理助手。',
    '你的任务：根据输入的书签信息生成 tags、summary 和分类推荐。',
    '输出必须且只能包含四行（不要 JSON、不要代码块、不要多余文字、不要空行）：',
    'tags: 标签1,标签2,标签3',
    'summary: 一句话摘要（<= 40 字）',
    'category: 推荐的已有分类名称',
    'new_category: 建议的新分类名称',
    '规则：',
    '- tags：3~8 个中文标签，每个 2~8 字，去重，按重要性排序；尽量是"用途/内容类型/领域"，避免泛词（如"官网/网站/主页"）。',
    '- summary：中文一句话，不要包含"tags:"前缀，不要引号/花括号/JSON，不要换行。',
    '- category：必须从用户提供的"已有分类列表"中选择最匹配的一个，完全匹配列表中的名称；若列表为空或确实无匹配则填"无"。',
    '- new_category：若已有分类都不太合适，建议一个简洁的新分类名称（2~6字）；若已有分类已足够合适则填"无"。',
    '若信息不足：给出最保守的用途/领域标签与最保守的用途描述。'
].join('\n');

function normalizeAiMode(input) {
    const m = String(input || '').trim().toLowerCase();
    if (m === 'refine' || m === 'retry') return 'refine';
    return 'default';
}

function getAiSystemPrompt(mode) {
    const normalizedMode = normalizeAiMode(mode);
    const override = String(process.env.AI_SYSTEM_PROMPT || '').trim();
    const base = (override || DEFAULT_AI_SYSTEM_PROMPT).slice(0, 2000);

    if (normalizedMode !== 'refine') return base;

    return [
        base,
        '',
        '【精炼模式】',
        '- 你必须输出 summary 行，且 summary 不允许为空。',
        '- 若 summary 难以判断，使用名称/网址给出最保守的一句话用途描述。'
    ].join('\n');
}

function buildAiUserPrompt(payload, mode) {
    const name = String(payload?.name || '').trim().slice(0, 200);
    const url = String(payload?.url || '').trim().slice(0, 2000);
    const description = String(payload?.description || '').trim().slice(0, 500);
    const tagsHint = String(payload?.tagsHint || '').trim().slice(0, 200);
    const categoriesHint = Array.isArray(payload?.categories)
        ? payload.categories.map(c => String(c || '').trim()).filter(Boolean).slice(0, 50).join('、')
        : '';
    const normalizedMode = normalizeAiMode(mode);
    return [
        '书签信息如下：',
        `名称: ${name || '-'}`,
        `网址: ${url || '-'}`,
        `描述: ${description || '-'}`,
        tagsHint ? `现有标签（可参考，不必照抄）: ${tagsHint}` : '',
        categoriesHint ? `已有分类列表: ${categoriesHint}` : '',
        '',
        normalizedMode === 'refine' ? '请严格按系统规则输出四行结果（summary 必须非空）。' : '请按系统规则输出四行结果。'
    ].join('\n');
}

function buildFallbackSummary({ name, url, tags }) {
    const safeName = String(name || '').trim();
    const safeUrl = String(url || '').trim();
    const tag0 = Array.isArray(tags) && tags[0] ? String(tags[0]).trim() : '';

    let host = '';
    try { host = new URL(safeUrl).hostname.replace(/^www\./, ''); } catch {}

    const subject = safeName || host || '该站点';
    if (tag0) return `${subject}：${tag0}相关站点`.slice(0, 40);
    return `${subject}：常用网站`.slice(0, 40);
}

// ========================================
// 解析工具
// ========================================

function normalizeTagsInput(input) {
    if (Array.isArray(input)) {
        return input.map(t => String(t || '').trim()).filter(Boolean).slice(0, 20);
    }
    const text = String(input || '');
    return text.split(/[,\n，;；|/]+/g).map(t => t.trim()).filter(Boolean).slice(0, 20);
}

function safeJsonParse(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch {}
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
        try { return JSON.parse(text.slice(first, last + 1)); } catch {}
    }
    return null;
}

function detectAiUpstreamErrorFromText(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();

    const hit =
        upper.includes('RESOURCE_EXHAUSTED') ||
        upper.includes('INSUFFICIENT_QUOTA') ||
        upper.includes('QUOTA_EXCEEDED') ||
        upper.includes('RATE_LIMIT') ||
        upper.includes('RATE_LIMITED');

    if (!hit) return null;

    if (upper.includes('RESOURCE_EXHAUSTED')) {
        return { statusCode: 429, message: 'AI 网关额度/并发已耗尽（RESOURCE_EXHAUSTED），请稍后再试或更换 Key/网关' };
    }
    if (upper.includes('INSUFFICIENT_QUOTA') || upper.includes('QUOTA_EXCEEDED')) {
        return { statusCode: 429, message: 'AI 网关额度不足（QUOTA），请更换/充值 Key 或降低调用频率' };
    }
    if (upper.includes('RATE_LIMIT')) {
        return { statusCode: 429, message: 'AI 网关触发限流（RATE_LIMIT），请稍后再试或降低调用频率' };
    }

    return { statusCode: 502, message: `AI 网关返回错误：${raw.slice(0, 120)}` };
}

function parseAiTagsAndSummaryFromText(text) {
    const raw = String(text || '').trim();
    if (!raw) return { tags: [], summary: '', category: '', newCategory: '' };

    // 1) JSON 优先
    const parsed = safeJsonParse(raw);
    if (parsed && typeof parsed === 'object') {
        let tags = normalizeTagsInput(parsed.tags);
        let summary = String(parsed.summary || '').trim().slice(0, 80);
        let category = String(parsed.category || parsed.recommended_category || '').trim().slice(0, 50);
        let newCategory = String(parsed.new_category || parsed.newCategory || parsed.suggested_new_category || '').trim().slice(0, 50);

        if (!tags.length && typeof parsed.tags === 'string') {
            const maybe = safeJsonParse(parsed.tags);
            if (Array.isArray(maybe)) tags = normalizeTagsInput(maybe);
            if (maybe && typeof maybe === 'object') tags = normalizeTagsInput(maybe.tags);
        }

        if ((!tags.length || !summary) && typeof parsed.summary === 'string') {
            const nested = safeJsonParse(parsed.summary);
            if (nested && typeof nested === 'object') {
                const nestedTags = normalizeTagsInput(nested.tags);
                const nestedSummary = String(nested.summary || '').trim().slice(0, 80);
                if (!tags.length && nestedTags.length) tags = nestedTags;
                if ((!summary || summary === String(parsed.summary || '').trim().slice(0, 80)) && nestedSummary) {
                    summary = nestedSummary;
                }
                if (summary && summary.startsWith('{') && nestedTags.length && !nestedSummary) {
                    summary = '';
                }
            }
        }

        return { tags, summary, category, newCategory };
    }

    // 1.5) 兜底：支持"JSON 片段/非严格 JSON"场景
    const extractQuotedStrings = (s) => {
        const result = [];
        const re = /"((?:\\.|[^"\\])*)"/g;
        let m;
        while ((m = re.exec(String(s || '')))) {
            const v = String(m[1] || '').trim();
            if (v) result.push(v);
        }
        return result;
    };

    const tagsKeyMatch = raw.match(/["']tags["']\s*:\s*\[/i);
    const summaryKeyMatch = raw.match(/["']summary["']\s*:\s*"/i);

    if (tagsKeyMatch || summaryKeyMatch) {
        let tags = [];
        let summary = '';

        if (tagsKeyMatch && typeof tagsKeyMatch.index === 'number') {
            const startIndex = tagsKeyMatch.index + tagsKeyMatch[0].length;
            const rest = raw.slice(startIndex);
            const endIndex = rest.indexOf(']');
            const segment = endIndex >= 0 ? rest.slice(0, endIndex) : rest;
            tags = extractQuotedStrings(segment).slice(0, 20);
        }

        if (summaryKeyMatch) {
            const m = raw.match(/["']summary["']\s*:\s*"((?:\\.|[^"\\])*)/i);
            if (m && m[1]) summary = String(m[1]).trim();
        }

        if (tags.length || summary) {
            summary = summary.slice(0, 80);
            return { tags, summary, category: '', newCategory: '' };
        }
    }

    // 2) 兜底：支持行式输出
    const tagsLine = raw.match(/(?:^|\n)\s*(?:tags|标签)\s*[:：]\s*(.+)\s*(?:\n|$)/i);
    const summaryLine = raw.match(/(?:^|\n)\s*(?:summary|摘要)\s*[:：]\s*(.+)\s*(?:\n|$)/i);
    const categoryLine = raw.match(/(?:^|\n)\s*(?:category|分类|推荐分类)\s*[:：]\s*(.+)\s*(?:\n|$)/i);
    const newCategoryLine = raw.match(/(?:^|\n)\s*(?:new_category|新分类|建议新分类|建议分类)\s*[:：]\s*(.+)\s*(?:\n|$)/i);

    let tags = normalizeTagsInput(tagsLine ? tagsLine[1] : '');
    let summary = summaryLine ? String(summaryLine[1] || '').trim() : '';
    let category = categoryLine ? String(categoryLine[1] || '').trim().slice(0, 50) : '';
    let newCategory = newCategoryLine ? String(newCategoryLine[1] || '').trim().slice(0, 50) : '';

    if (/^(无|没有|空|-|none|null|n\/a)$/i.test(category)) category = '';
    if (/^(无|没有|空|-|none|null|n\/a)$/i.test(newCategory)) newCategory = '';

    if (!summary) {
        const firstNonTagsLine = raw
            .split('\n')
            .map(s => String(s || '').trim())
            .filter(Boolean)
            .find(line => !/^(?:tags|标签|category|分类|new_category|新分类)\s*[:：]/i.test(line));
        summary = firstNonTagsLine || '';
    }
    summary = summary.slice(0, 80);

    if (/^(?:tags|标签)\s*[:：]/i.test(summary)) {
        if (!tags.length) {
            const m = summary.match(/^(?:tags|标签)\s*[:：]\s*(.+)$/i);
            tags = normalizeTagsInput(m ? m[1] : '');
        }
        summary = '';
    }
    if (!tags.length) {
        const looseTags = raw.match(/(?:tags|标签)\s*[:：]\s*([^\n\r]+)/i);
        if (looseTags && looseTags[1]) tags = normalizeTagsInput(looseTags[1]);
    }
    if (!summary) {
        const looseSummary = raw.match(/(?:summary|摘要)\s*[:：]\s*([^\n\r]+)/i);
        if (looseSummary && looseSummary[1]) summary = String(looseSummary[1]).trim().slice(0, 80);
    }
    return { tags, summary, category, newCategory };
}

// ========================================
// HTTP 工具
// ========================================

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

function formatFetchCause(err) {
    const parts = [];
    const cause = err && typeof err === 'object' ? err.cause : null;

    if (err && typeof err === 'object') {
        if (err.code) parts.push(`code=${err.code}`);
        if (err.errno) parts.push(`errno=${err.errno}`);
        if (err.syscall) parts.push(`syscall=${err.syscall}`);
    }

    if (cause && typeof cause === 'object') {
        if (cause.code) parts.push(`cause.code=${cause.code}`);
        if (cause.errno) parts.push(`cause.errno=${cause.errno}`);
        if (cause.syscall) parts.push(`cause.syscall=${cause.syscall}`);
        if (cause.hostname) parts.push(`cause.hostname=${cause.hostname}`);
        if (cause.address) parts.push(`cause.address=${cause.address}`);
        if (cause.port) parts.push(`cause.port=${cause.port}`);
        if (cause.message) parts.push(`cause.message=${cause.message}`);
    }

    return parts.length ? `（${parts.join(', ')}）` : '';
}

function extractTextFromOpenAiLikeResponse(data) {
    if (!data || typeof data !== 'object') return '';

    const choice0 = Array.isArray(data.choices) ? data.choices[0] : null;
    const message = choice0 && typeof choice0 === 'object' ? choice0.message : null;
    const content = message && typeof message === 'object' ? message.content : null;
    if (typeof content === 'string' && content.trim()) return content;
    if (content && typeof content === 'object' && typeof content.text === 'string' && content.text.trim()) return content.text;
    if (Array.isArray(content)) {
        const joined = content
            .map(part => {
                if (!part) return '';
                if (typeof part === 'string') return part;
                if (typeof part === 'object') return part.text || part.content || '';
                return '';
            })
            .filter(Boolean)
            .join('');
        if (joined.trim()) return joined;
    }

    const choiceText = choice0 && typeof choice0.text === 'string' ? choice0.text : '';
    if (choiceText.trim()) return choiceText;

    const delta = choice0 && typeof choice0.delta === 'object' ? choice0.delta : null;
    const deltaContent = delta && typeof delta.content === 'string' ? delta.content : '';
    if (deltaContent.trim()) return deltaContent;

    const output0 = Array.isArray(data.output) ? data.output[0] : null;
    const outputContent = output0 && typeof output0 === 'object' ? output0.content : null;
    if (Array.isArray(outputContent)) {
        const joined = outputContent
            .map(part => {
                if (!part || typeof part !== 'object') return '';
                return part.text || '';
            })
            .filter(Boolean)
            .join('');
        if (joined.trim()) return joined;
    }

    if (typeof data.text === 'string' && data.text.trim()) return data.text;
    if (typeof data.content === 'string' && data.content.trim()) return data.content;

    return '';
}

function extractTextFromOpenAiSse(rawText) {
    const raw = String(rawText || '').trim();
    if (!raw) return '';
    const lines = raw.split(/\r?\n/);
    let acc = '';

    for (const line of lines) {
        const trimmed = String(line || '').trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice('data:'.length).trim();
        if (!payload || payload === '[DONE]') continue;
        const obj = safeJsonParse(payload);
        if (!obj) continue;
        const piece = extractTextFromOpenAiLikeResponse(obj);
        if (piece) acc += piece;
    }

    return acc.trim();
}

function summarizeOpenAiLikeResponseShape(data) {
    if (!data || typeof data !== 'object') return 'data=null';
    const topKeys = Object.keys(data).slice(0, 20);
    const choice0 = Array.isArray(data.choices) ? data.choices[0] : null;
    const choiceKeys = choice0 && typeof choice0 === 'object' ? Object.keys(choice0).slice(0, 20) : [];
    const finishReason = choice0 && typeof choice0 === 'object' ? choice0.finish_reason : undefined;
    return `keys=${topKeys.join(',') || '-'}; choiceKeys=${choiceKeys.join(',') || '-'}; finish_reason=${finishReason ?? '-'}`;
}

// ========================================
// Provider 配置解析
// ========================================

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

function getServerApiKeyForProvider(provider) {
    if (provider === 'openai') return process.env.OPENAI_API_KEY || '';
    if (provider === 'gemini') return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    if (provider === 'claude') return process.env.ANTHROPIC_API_KEY || '';
    return '';
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

function resolveRuntimeConfig(body) {
    const provider = resolveProvider(body);
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
            throw new Error('缺少 AI Key：请在"AI 设置"里填写，或在服务器环境变量中配置对应 Provider 的 Key');
        }
        throw new Error('缺少 AI Key：请在服务器环境变量中配置对应 Provider 的 Key');
    }

    return cfg;
}

// ========================================
// Provider 生成逻辑
// ========================================

async function openaiGenerateWithConfig({ name, url, description, tagsHint, categories, mode, baseUrl, apiKey, model, timeoutMs }) {
    const userPayload = {
        name: String(name || '').slice(0, 200),
        url: String(url || '').slice(0, 2000),
        description: String(description || '').slice(0, 500),
        tagsHint: String(tagsHint || '').slice(0, 200),
        categories: Array.isArray(categories) ? categories : []
    };

    const systemPrompt = getAiSystemPrompt(mode);
    const userPrompt = buildAiUserPrompt(userPayload, mode);

    const endpoint = `${String(baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
    let response;
    try {
        response = await fetchWithTimeout(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                stream: false,
                temperature: 0,
                max_tokens: 280
            })
        }, timeoutMs);
    } catch (e) {
        if (e?.name === 'AbortError') {
            throw createHttpError(504, 'OpenAI 网关请求超时');
        }
        throw createHttpError(502, `无法连接 OpenAI 网关（${endpoint}）：${e?.message || 'network error'}${formatFetchCause(e)}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text().catch(() => '');
    const data = safeJsonParse(rawText);
    if (!response.ok) {
        const detail = data?.error?.message || '';
        const fallback = !detail && rawText ? `：${String(rawText).trim().slice(0, 200)}` : '';
        const message = `OpenAI 网关错误（HTTP ${response.status}）${detail ? `：${detail}` : fallback}`;
        throw createHttpError(502, message);
    }

    const isSse = contentType.includes('text/event-stream') || /^\s*data:\s*\{/.test(rawText);
    const text = data
        ? extractTextFromOpenAiLikeResponse(data)
        : (isSse ? extractTextFromOpenAiSse(rawText) : rawText);
    console.log('[AI OpenAI] raw text from model:', text);
    const upstreamErr = detectAiUpstreamErrorFromText(text);
    if (upstreamErr) throw createHttpError(upstreamErr.statusCode, upstreamErr.message);
    let { tags, summary, category, newCategory } = parseAiTagsAndSummaryFromText(text);
    console.log('[AI OpenAI] parsed result:', { tags, summary, category, newCategory });
    if (normalizeAiMode(mode) === 'refine' && !summary) {
        const effectiveTags = tags.length ? tags : normalizeTagsInput(tagsHint);
        summary = buildFallbackSummary({ name, url, tags: effectiveTags });
    }
    if (!tags.length && !summary) {
        if (!rawText) {
            throw createHttpError(502, `OpenAI 网关返回内容无法解析（响应为空）。content-type=${contentType || '-'}; endpoint=${endpoint}`);
        }
        if (isSse) {
            throw createHttpError(502, `OpenAI 网关返回内容无法解析（SSE 未包含可用文本片段）。content-type=${contentType || '-'}; raw=${String(rawText).trim().slice(0, 200)}`);
        }
        const hint = data
            ? summarizeOpenAiLikeResponseShape(data)
            : `content-type=${contentType || '-'}; raw=${String(rawText).trim().slice(0, 200)}`;
        throw createHttpError(502, `OpenAI 网关返回内容无法解析（内容为空或格式异常）。${hint}`);
    }
    return { tags, summary, category, newCategory, provider: 'openai', model };
}

async function geminiGenerateWithConfig({ name, url, description, tagsHint, categories, mode, baseUrl, apiKey, model, timeoutMs }) {
    const userPayload = {
        name: String(name || '').slice(0, 200),
        url: String(url || '').slice(0, 2000),
        description: String(description || '').slice(0, 500),
        tagsHint: String(tagsHint || '').slice(0, 200),
        categories: Array.isArray(categories) ? categories : []
    };

    const prompt = `${getAiSystemPrompt(mode)}\n\n${buildAiUserPrompt(userPayload, mode)}`;

    const base = String(baseUrl || '').replace(/\/+$/, '');
    const endpoint = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let response;
    try {
        response = await fetchWithTimeout(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0, maxOutputTokens: 280 }
            })
        }, timeoutMs);
    } catch (e) {
        if (e?.name === 'AbortError') {
            throw createHttpError(504, 'Gemini 网关请求超时');
        }
        throw createHttpError(502, `无法连接 Gemini 网关（${endpoint}）：${e?.message || 'network error'}${formatFetchCause(e)}`);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = data?.error?.message || '';
        const message = `Gemini 网关错误（HTTP ${response.status}）${detail ? `：${detail}` : ''}`;
        throw createHttpError(502, message);
    }

    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
    const upstreamErr = detectAiUpstreamErrorFromText(text);
    if (upstreamErr) throw createHttpError(upstreamErr.statusCode, upstreamErr.message);
    let { tags, summary, category, newCategory } = parseAiTagsAndSummaryFromText(text);
    if (normalizeAiMode(mode) === 'refine' && !summary) {
        const effectiveTags = tags.length ? tags : normalizeTagsInput(tagsHint);
        summary = buildFallbackSummary({ name, url, tags: effectiveTags });
    }
    if (!tags.length && !summary) throw createHttpError(502, 'Gemini 网关返回内容无法解析（内容为空或格式异常）');
    return { tags, summary, category, newCategory, provider: 'gemini', model };
}

async function claudeGenerateWithConfig({ name, url, description, tagsHint, categories, mode, baseUrl, apiKey, model, timeoutMs }) {
    const userPayload = {
        name: String(name || '').slice(0, 200),
        url: String(url || '').slice(0, 2000),
        description: String(description || '').slice(0, 500),
        tagsHint: String(tagsHint || '').slice(0, 200),
        categories: Array.isArray(categories) ? categories : []
    };

    const systemPrompt = getAiSystemPrompt(mode);
    const userPrompt = buildAiUserPrompt(userPayload, mode);

    const endpoint = `${String(baseUrl || '').replace(/\/+$/, '')}/messages`;
    let response;
    try {
        response = await fetchWithTimeout(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01'
            },
            body: JSON.stringify({
                model,
                max_tokens: 280,
                temperature: 0,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }]
            })
        }, timeoutMs);
    } catch (e) {
        if (e?.name === 'AbortError') {
            throw createHttpError(504, 'Claude 网关请求超时');
        }
        throw createHttpError(502, `无法连接 Claude 网关（${endpoint}）：${e?.message || 'network error'}${formatFetchCause(e)}`);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = data?.error?.message || '';
        const message = `Claude 网关错误（HTTP ${response.status}）${detail ? `：${detail}` : ''}`;
        throw createHttpError(502, message);
    }

    const text = Array.isArray(data?.content)
        ? data.content.map(c => (c && c.type === 'text' ? c.text : '')).filter(Boolean).join('')
        : (data?.content?.text || '');
    const upstreamErr = detectAiUpstreamErrorFromText(text);
    if (upstreamErr) throw createHttpError(upstreamErr.statusCode, upstreamErr.message);
    let { tags, summary, category, newCategory } = parseAiTagsAndSummaryFromText(text);
    if (normalizeAiMode(mode) === 'refine' && !summary) {
        const effectiveTags = tags.length ? tags : normalizeTagsInput(tagsHint);
        summary = buildFallbackSummary({ name, url, tags: effectiveTags });
    }
    if (!tags.length && !summary) throw createHttpError(502, 'Claude 网关返回内容无法解析（内容为空或格式异常）');
    return { tags, summary, category, newCategory, provider: 'claude', model };
}

// ========================================
// 数据库操作
// ========================================

async function ensureAiTables(db) {
    const createSql = db.USE_MYSQL
        ? `CREATE TABLE IF NOT EXISTS bookmark_ai (
                bookmark_id VARCHAR(50) PRIMARY KEY,
                tags LONGTEXT,
                summary TEXT,
                provider VARCHAR(50),
                model VARCHAR(100),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        : `CREATE TABLE IF NOT EXISTS bookmark_ai (
                bookmark_id TEXT PRIMARY KEY,
                tags TEXT,
                summary TEXT,
                provider TEXT,
                model TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`;
    await db.execute(createSql);
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

// ========================================
// 公开 API
// ========================================

async function getBookmarkAi(db, id) {
    await ensureAiTables(db);
    const row = await db.queryOne('SELECT * FROM bookmark_ai WHERE bookmark_id = ?', [id]);
    if (!row) return null;

    let tags = [];
    try { tags = JSON.parse(row.tags || '[]'); } catch {}
    return {
        bookmark_id: row.bookmark_id,
        tags: Array.isArray(tags) ? tags : [],
        summary: row.summary || '',
        provider: row.provider || null,
        model: row.model || null,
        updated_at: row.updated_at || null
    };
}

async function saveBookmarkAi(db, { bookmarkId, tags, summary }) {
    await ensureAiTables(db);
    await upsertBookmarkAi(db, {
        bookmarkId,
        tags: normalizeTagsInput(tags),
        summary: summary ? String(summary).trim().slice(0, 200) : '',
        provider: 'manual',
        model: null
    });
}

async function generateAi(db, body) {
    if (!isAiEnabledFlag()) {
        throw createHttpError(400, 'AI 功能未启用（请设置 AI_ENABLED=true）');
    }

    const { bookmarkId, name, url, description, persist, mode, tagsHint, categories } = body || {};
    const shouldPersist = String(persist).toLowerCase() === 'true';
    const id = String(bookmarkId || '').trim();

    const cfg = resolveRuntimeConfig(body);
    let result;
    if (cfg.provider === 'openai') result = await openaiGenerateWithConfig({ name, url, description, mode, tagsHint, categories, ...cfg });
    else if (cfg.provider === 'gemini') result = await geminiGenerateWithConfig({ name, url, description, mode, tagsHint, categories, ...cfg });
    else if (cfg.provider === 'claude') result = await claudeGenerateWithConfig({ name, url, description, mode, tagsHint, categories, ...cfg });
    else throw createHttpError(400, `不支持的 AI_PROVIDER: ${cfg.provider}`);

    console.log('[AI handler] result from provider:', JSON.stringify(result));

    if (shouldPersist) {
        if (!id) throw createHttpError(400, '持久化需要提供 bookmarkId');
        await ensureAiTables(db);
        await upsertBookmarkAi(db, { bookmarkId: id, ...result });
    }

    const responseData = { tags: result.tags, summary: result.summary, category: result.category || '', newCategory: result.newCategory || '' };
    console.log('[AI handler] response data:', JSON.stringify(responseData));
    return responseData;
}

module.exports = {
    getAiPublicStatus,
    getBookmarkAi,
    saveBookmarkAi,
    generateAi,
    normalizeTagsInput
};
