/**
 * Claude Provider
 */

const { getAiSystemPrompt, buildAiUserPrompt, buildFallbackSummary, normalizeAiMode } = require('../prompt');
const { parseAiTagsAndSummaryFromText, detectAiUpstreamErrorFromText, normalizeTagsInput } = require('../parser');
const { fetchWithTimeout, createHttpError, formatFetchCause } = require('../http');
const { supportsClaudeSampling, supportsClaudeThinking } = require('../params');

async function claudeGenerateWithConfig({ name, url, description, tagsHint, categories, mode, baseUrl, apiKey, model, timeoutMs, generationParams }) {
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
    const params = generationParams || { maxTokens: 280 };
    const requestBody = {
        model,
        max_tokens: params.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
    };

    if (supportsClaudeSampling(model)) {
        if (params.temperature !== undefined) requestBody.temperature = params.temperature;
        if (params.topP !== undefined) requestBody.top_p = params.topP;
    }

    if (supportsClaudeThinking(model)) {
        if (params.claudeThinking === 'adaptive') {
            requestBody.thinking = { type: 'adaptive' };
        } else if (params.claudeThinking === 'disabled') {
            requestBody.thinking = { type: 'disabled' };
        }
    }

    let response;
    try {
        response = await fetchWithTimeout(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01'
            },
            body: JSON.stringify(requestBody)
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
    const parsed = parseAiTagsAndSummaryFromText(text);
    const { tags, category, newCategory } = parsed;
    let { summary } = parsed;
    if (normalizeAiMode(mode) === 'refine' && !summary) {
        const effectiveTags = tags.length ? tags : normalizeTagsInput(tagsHint);
        summary = buildFallbackSummary({ name, url, tags: effectiveTags });
    }
    if (!tags.length && !summary) throw createHttpError(502, 'Claude 网关返回内容无法解析（内容为空或格式异常）');
    return { tags, summary, category, newCategory, provider: 'claude', model };
}

module.exports = {
    claudeGenerateWithConfig
};
