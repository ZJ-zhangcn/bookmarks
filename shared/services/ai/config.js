/**
 * AI 配置管理模块
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
        supportedProviders: ['openai', 'gemini', 'claude']
    };
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

module.exports = {
    isAiEnabledFlag,
    getAiProvider,
    getDefaultModelForProvider,
    getDefaultBaseUrlForProvider,
    allowClientKey,
    allowClientBaseUrl,
    allowClientProvider,
    allowPrivateBaseUrl,
    hasServerKey,
    getAiPublicStatus,
    isPrivateOrLocalAddress,
    normalizeBaseUrl,
    getServerApiKeyForProvider,
    resolveProvider,
    resolveRuntimeConfig
};
