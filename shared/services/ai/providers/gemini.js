/**
 * Gemini Provider
 */

const { getAiSystemPrompt, buildAiUserPrompt, buildFallbackSummary, normalizeAiMode } = require('../prompt');
const { parseAiTagsAndSummaryFromText, detectAiUpstreamErrorFromText, normalizeTagsInput } = require('../parser');
const { fetchWithTimeout, createHttpError, formatFetchCause } = require('../http');

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

module.exports = {
    geminiGenerateWithConfig
};
