/**
 * OpenAI Provider
 */

const { getAiSystemPrompt, buildAiUserPrompt, buildFallbackSummary, normalizeAiMode } = require('../prompt');
const { parseAiTagsAndSummaryFromText, detectAiUpstreamErrorFromText, normalizeTagsInput, safeJsonParse } = require('../parser');
const { fetchWithTimeout, createHttpError, formatFetchCause, extractTextFromOpenAiLikeResponse, extractTextFromOpenAiSse, summarizeOpenAiLikeResponseShape } = require('../http');
const { supportsOpenAiSampling, supportsOpenAiReasoningEffort } = require('../params');

async function openaiGenerateWithConfig({ name, url, description, tagsHint, categories, mode, baseUrl, apiKey, model, timeoutMs, generationParams }) {
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
    const params = generationParams || { maxTokens: 280, temperature: 0 };
    const requestBody = {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        stream: false
    };

    if (supportsOpenAiReasoningEffort(model, baseUrl)) {
        requestBody.max_completion_tokens = params.maxTokens;
    } else {
        requestBody.max_tokens = params.maxTokens;
    }

    if (supportsOpenAiSampling(model, baseUrl)) {
        if (params.temperature !== undefined) requestBody.temperature = params.temperature;
        if (params.topP !== undefined) requestBody.top_p = params.topP;
    }

    if (params.reasoningEffort && supportsOpenAiReasoningEffort(model, baseUrl)) {
        requestBody.reasoning_effort = params.reasoningEffort;
    }

    let response;
    try {
        response = await fetchWithTimeout(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
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
    const parsed = parseAiTagsAndSummaryFromText(text);
    const { tags, category, newCategory } = parsed;
    let { summary } = parsed;
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

module.exports = {
    openaiGenerateWithConfig
};
