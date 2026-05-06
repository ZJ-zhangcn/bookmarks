function allowClientParams() {
    return String(process.env.AI_ALLOW_CLIENT_PARAMS).toLowerCase() === 'true';
}

function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function parseNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function parseMaxTokens(value) {
    const num = parseNumber(value);
    if (num === null) return null;
    return Math.min(8192, Math.max(32, Math.floor(num)));
}

function parseTemperature(value) {
    const num = parseNumber(value);
    if (num === null) return null;
    return Math.min(2, Math.max(0, num));
}

function parseTopP(value) {
    const num = parseNumber(value);
    if (num === null) return null;
    return Math.min(1, Math.max(0, num));
}

function parseReasoningEffort(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ['minimal', 'low', 'medium', 'high'].includes(normalized) ? normalized : null;
}

function parseClaudeThinking(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ['adaptive', 'disabled'].includes(normalized) ? normalized : null;
}

function readParam(source, camelKey, snakeKey) {
    if (!isPlainObject(source)) return undefined;
    if (hasOwn(source, camelKey)) return source[camelKey];
    if (snakeKey && hasOwn(source, snakeKey)) return source[snakeKey];
    return undefined;
}

function applyGenerationParams(params, source) {
    const maxTokens = parseMaxTokens(readParam(source, 'maxTokens', 'max_tokens'));
    if (maxTokens !== null) params.maxTokens = maxTokens;

    const temperature = parseTemperature(readParam(source, 'temperature'));
    if (temperature !== null) params.temperature = temperature;

    const topP = parseTopP(readParam(source, 'topP', 'top_p'));
    if (topP !== null) params.topP = topP;

    const reasoningEffort = parseReasoningEffort(readParam(source, 'reasoningEffort', 'reasoning_effort'));
    if (reasoningEffort) params.reasoningEffort = reasoningEffort;

    const claudeThinking = parseClaudeThinking(readParam(source, 'claudeThinking', 'claude_thinking'));
    if (claudeThinking) params.claudeThinking = claudeThinking;

    return params;
}

function resolveGenerationParams({ body } = {}) {
    const params = {
        maxTokens: 280,
        temperature: 0
    };

    applyGenerationParams(params, {
        maxTokens: process.env.AI_MAX_TOKENS,
        temperature: process.env.AI_TEMPERATURE,
        topP: process.env.AI_TOP_P,
        reasoningEffort: process.env.AI_REASONING_EFFORT,
        claudeThinking: process.env.AI_CLAUDE_THINKING
    });

    const requestBody = body || {};
    if (hasOwn(requestBody, 'aiParams') && requestBody.aiParams != null) {
        if (!allowClientParams()) {
            throw new Error('服务器未允许从前端覆盖 AI 生成参数（可设置 AI_ALLOW_CLIENT_PARAMS=true 放开）');
        }
        applyGenerationParams(params, requestBody.aiParams);
    }

    return params;
}

function normalizeModel(model) {
    return String(model || '').trim().toLowerCase();
}

function isOfficialOpenAiBaseUrl(baseUrl) {
    try {
        return new URL(String(baseUrl || '')).hostname.toLowerCase() === 'api.openai.com';
    } catch {
        return false;
    }
}

function usesOpenAiMaxCompletionTokens(model) {
    const normalized = normalizeModel(model);
    return /^(?:o[1-9](?:[-.]|$)|gpt-5(?:[-.]|$))/.test(normalized);
}

function supportsOpenAiSampling(model, baseUrl) {
    if (!isOfficialOpenAiBaseUrl(baseUrl)) return true;
    return !usesOpenAiMaxCompletionTokens(model);
}

function supportsOpenAiReasoningEffort(model, baseUrl) {
    return isOfficialOpenAiBaseUrl(baseUrl) && usesOpenAiMaxCompletionTokens(model);
}

function supportsClaudeSampling(model) {
    const normalized = normalizeModel(model);
    return !normalized.includes('opus-4-7');
}

function supportsClaudeThinking(model) {
    const normalized = normalizeModel(model);
    return normalized.includes('opus-4-7') || normalized.includes('opus-4-6') || normalized.includes('sonnet-4-6');
}

module.exports = {
    allowClientParams,
    resolveGenerationParams,
    isOfficialOpenAiBaseUrl,
    usesOpenAiMaxCompletionTokens,
    supportsOpenAiSampling,
    supportsOpenAiReasoningEffort,
    supportsClaudeSampling,
    supportsClaudeThinking
};
