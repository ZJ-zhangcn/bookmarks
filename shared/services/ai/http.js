/**
 * AI HTTP 工具模块
 */

const { safeJsonParse } = require('./parser');

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

module.exports = {
    fetchWithTimeout,
    createHttpError,
    formatFetchCause,
    extractTextFromOpenAiLikeResponse,
    extractTextFromOpenAiSse,
    summarizeOpenAiLikeResponseShape
};
